/**
 * RecordingCtx — the `Ctx` implementation given to setup() (SPEC §5).
 *
 * Reads run immediately against `appDir` so setup() can branch on real project
 * state; writes are *recorded* as an ordered `Op[]` and never touch disk. The
 * plan builder later turns those ops into a reviewable Plan, and apply realizes
 * them inside a transaction. `run()` enforces the `exec` capability (SPEC §7).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Answers,
  Capabilities,
  ConfigEdit,
  ConfigFileKind,
  Ctx,
  EnsureLineOpts,
  Op,
  Prompt,
  WrapSpec,
} from "../types.js";

export interface RecordingCtxOptions {
  appDir: string;
  repoRoot: string;
  answers: Answers;
  /** Injected prompt handler (CLI/MCP owns real prompting). */
  prompter: (p: Prompt) => Promise<unknown>;
  /** Resolve a `files/...` reference to text (from the LoadedPlugin). */
  file: (ref: string) => string;
  /** Declared capabilities — gates effectful ops like run(). */
  capabilities: Capabilities;
}

export class RecordingCtx implements Ctx {
  readonly appDir: string;
  readonly repoRoot: string;
  readonly answers: Answers;

  private readonly prompter: (p: Prompt) => Promise<unknown>;
  private readonly fileResolver: (ref: string) => string;
  private readonly capabilities: Capabilities;
  private readonly recorded: Op[] = [];
  private readonly recordedWarnings: string[] = [];

  constructor(opts: RecordingCtxOptions) {
    this.appDir = opts.appDir;
    this.repoRoot = opts.repoRoot;
    this.answers = opts.answers;
    this.prompter = opts.prompter;
    this.fileResolver = opts.file;
    this.capabilities = opts.capabilities;
  }

  /** The ordered write ops recorded so far. */
  get ops(): Op[] {
    return this.recorded;
  }

  /** Manual steps surfaced via warn(), in call order. */
  get warnings(): string[] {
    return this.recordedWarnings;
  }

  private abs(p: string): string {
    return path.join(this.appDir, p);
  }

  // --- READS (immediate) ---------------------------------------------------

  exists(p: string): boolean {
    return fs.existsSync(this.abs(p));
  }

  readJson(p: string): unknown | null {
    try {
      return JSON.parse(fs.readFileSync(this.abs(p), "utf8"));
    } catch {
      return null;
    }
  }

  readText(p: string): string | null {
    try {
      return fs.readFileSync(this.abs(p), "utf8");
    } catch {
      return null;
    }
  }

  prompt(p: Prompt): Promise<unknown> {
    return this.prompter(p);
  }

  // --- SEMANTIC RESOLVERS (reads, deterministic priority order) -----------

  /** True when the app looks like a TypeScript project. */
  private isTs(): boolean {
    if (this.exists("tsconfig.json")) return true;
    const pkg = this.readJson("package.json") as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    } | null;
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    return "typescript" in deps;
  }

  /** True when a given package is a declared dependency of the app. */
  private hasDep(name: string): boolean {
    const pkg = this.readJson("package.json") as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    } | null;
    return (
      name in { ...pkg?.dependencies } || name in { ...pkg?.devDependencies }
    );
  }

  entryFile(): string {
    const ts = this.isTs();

    // 1. Explicit entry from package.json "main"/"module", if it exists.
    const pkg = this.readJson("package.json") as {
      main?: unknown;
      module?: unknown;
    } | null;
    for (const field of [pkg?.module, pkg?.main]) {
      if (typeof field === "string" && field.trim() !== "" && this.exists(field)) {
        return normalizeRel(field);
      }
    }

    // 2. Priority list of conventional entry files (first existing wins).
    const priority = [
      "src/main.tsx",
      "src/main.jsx",
      "src/main.ts",
      "src/main.js",
      "src/index.tsx",
      "src/index.ts",
      "src/index.jsx",
      "src/index.js",
      "index.tsx",
      "index.ts",
      "index.js", // React Native's registerRootComponent entry
      "App.tsx",
      "App.jsx",
      "App.js",
    ];
    const existing = priority.find((p) => this.exists(p));
    if (existing) return existing;

    // 3. No entry on disk yet → conventional default for the language/framework.
    if (this.hasDep("react-native") || this.hasDep("expo")) return "index.js";
    return ts ? "src/main.tsx" : "src/main.jsx";
  }

  /** Resolve a `.css` module referenced by the entry file, if it exists. */
  private cssImportedByEntry(): string | null {
    const entry = this.entryFile();
    const src = this.readText(entry);
    if (src === null) return null;
    const re = /import\s+(?:[^'"]*from\s+)?['"]([^'"]+\.css)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const ref = m[1]!;
      // Resolve relative to the entry file's directory.
      const rel = normalizeRel(path.join(path.dirname(entry), ref));
      if (this.exists(rel)) return rel;
    }
    return null;
  }

  stylesheet(opts?: { createIfMissing?: boolean }): string {
    // 1. A `.css` imported by the entry file.
    const imported = this.cssImportedByEntry();
    if (imported) return imported;

    // 2. Common global-stylesheet names.
    const common = [
      "src/index.css",
      "src/global.css",
      "src/app.css",
      "global.css",
      "app/global.css",
      "styles/global.css",
    ];
    const found = common.find((p) => this.exists(p));
    if (found) return found;

    // Conventional default location for this project shape.
    const defaultCss = this.exists("src") || this.isTs() ? "src/index.css" : "index.css";

    // 3. Create + wire it on request.
    if (opts?.createIfMissing) {
      this.addFile(defaultCss, "");
      const entry = this.entryFile();
      const ref = relativeImport(entry, defaultCss);
      this.ensureImport(entry, { import: ref });
      return defaultCss;
    }

    return defaultCss;
  }

  configFile(kind: ConfigFileKind): string | null {
    const candidates: Record<ConfigFileKind, string[]> = {
      vite: [
        "vite.config.ts",
        "vite.config.js",
        "vite.config.mts",
        "vite.config.mjs",
      ],
      tailwind: [
        "tailwind.config.ts",
        "tailwind.config.js",
        "tailwind.config.cjs",
        "tailwind.config.mjs",
      ],
      tsconfig: ["tsconfig.json"],
      next: [
        "next.config.ts",
        "next.config.js",
        "next.config.mjs",
        "next.config.cjs",
      ],
      metro: ["metro.config.js", "metro.config.ts", "metro.config.cjs"],
    };
    return this.find(candidates[kind]);
  }

  find(candidates: string[]): string | null {
    return candidates.find((p) => this.exists(p)) ?? null;
  }

  findOrCreate(
    candidates: string[],
    defaultPath: string,
    initialContent = "",
  ): string {
    const existing = this.find(candidates);
    if (existing) return existing;
    this.addFile(defaultPath, initialContent);
    return defaultPath;
  }

  // --- WRITES (deferred → recorded) ---------------------------------------

  install(pkgs: string[]): void {
    this.recorded.push({ op: "installDeps", packages: [...pkgs], dev: false });
  }

  installDev(pkgs: string[]): void {
    this.recorded.push({ op: "installDeps", packages: [...pkgs], dev: true });
  }

  copy(from: string, to: string): void {
    // Resolve the template now; record it as a concrete addFile op.
    const content = this.fileResolver(from);
    this.recorded.push({ op: "addFile", to, content });
  }

  addFile(to: string, content: string): void {
    this.recorded.push({ op: "addFile", to, content });
  }

  patchJson(file: string, merge: Record<string, unknown>): void {
    this.recorded.push({ op: "patchJson", file, merge });
  }

  patchConfig(file: string, edit: ConfigEdit): void {
    this.recorded.push({ op: "patchConfig", file, edit });
  }

  ensureLine(file: string, line: string, opts?: EnsureLineOpts): void {
    this.recorded.push({ op: "ensureLine", file, line, opts });
  }

  ensureImport(file: string, spec: { import: string; call?: string }): void {
    this.recorded.push({
      op: "ensureImport",
      file,
      import: spec.import,
      call: spec.call,
    });
  }

  wrap(file: string, wrappers: WrapSpec | WrapSpec[]): void {
    const list = Array.isArray(wrappers) ? wrappers : [wrappers];
    this.recorded.push({ op: "wrap", file, wrappers: list });
  }

  setScript(name: string, command: string): void {
    this.recorded.push({ op: "setScript", name, command });
  }

  run(cmd: string): void {
    if (!this.capabilities.exec) {
      throw new Error(
        `plugin declared no "exec" capability but called ctx.run(${JSON.stringify(cmd)})`,
      );
    }
    this.recorded.push({ op: "run", cmd });
  }

  warn(message: string): void {
    this.recordedWarnings.push(message);
  }
}

/** Normalize a filesystem-style relative path to forward slashes. */
function normalizeRel(p: string): string {
  return p.split(path.sep).join("/").replace(/^\.\//, "");
}

/**
 * A module specifier importing `target` from `from`'s directory, e.g.
 * (`src/main.tsx`, `src/index.css`) → `"./index.css"`. Extension is dropped for
 * JS/TS, kept for CSS so the bundler treats it as a side-effect import.
 */
function relativeImport(from: string, target: string): string {
  let rel = path.relative(path.dirname(from), target).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}
