/**
 * XInit core contracts (frozen for v1 — see SPEC.md).
 *
 * These types are the seam between subsystems (detect, patch, tx, plugin
 * runtime) and the front-ends (cli, mcp). Implementations depend on these
 * shapes; keep changes backward-compatible within schemaVersion 1.
 */

// ---------------------------------------------------------------------------
// Project model (output of detect())
// ---------------------------------------------------------------------------

export type Language = "js" | "ts" | "python";
export type ProjectKind = "single" | "monorepo";

export interface DetectedApp {
  /** Human name (usually the package/dir name). */
  name: string;
  /** Path relative to the project root. "." for a single-app project. */
  path: string;
  language: Language;
  /** e.g. "react" | "next" | "express" | "fastapi" | "django". Undefined if unknown. */
  framework?: string;
  /** Names of plugins detected as already installed (UX only — see SPEC §6). */
  plugins: string[];
}

export interface Project {
  root: string;
  kind: ProjectKind;
  /** pnpm | npm | yarn | bun | pnpm+turbo | uv | poetry | pip | ... */
  manager: string;
  /** 0..1 heuristic confidence; the CLI asks the user to confirm when low. */
  confidence: number;
  apps: DetectedApp[];
  packages: DetectedApp[];
}

// ---------------------------------------------------------------------------
// Plugin manifest (the "facts" — plugin.json)
// ---------------------------------------------------------------------------

export type Capability = "install" | "exec" | "network";
export type Capabilities = Record<Capability, boolean>;

export type PromptType = "confirm" | "text" | "select" | "multiselect";

export interface Prompt {
  id: string;
  type: PromptType;
  message: string;
  default?: unknown;
  /** Required for select/multiselect. */
  choices?: string[];
}

/** How to detect a plugin is already present. UX only — NOT the idempotency guard. */
export type DetectRule = { dependency: string } | { file: string };

export interface PluginManifest {
  schemaVersion: 1;
  name: string;
  displayName: string;
  version?: string;
  appliesTo?: { type?: string; framework?: string };
  /**
   * App languages this plugin supports. Omitted ⇒ no restriction (universal).
   * Present ⇒ compatible only when the target app's `language` is in this list.
   */
  languages?: Language[];
  dependsOn?: string[];
  conflicts?: string[];
  /** semver ranges, e.g. { react: ">=19", tailwindcss: ">=4" }. */
  requires?: Record<string, string>;
  capabilities: Capabilities;
  detect?: DetectRule;
  prompts?: Prompt[];

  // --- packed-artifact fields (present only after `xinit pack`) ---
  /** path (relative to plugin root) -> base64 file content. */
  files?: Record<string, string>;
  /** bundled setup() source as a string (esbuild output). */
  setup?: string;
}

export type Answers = Record<string, unknown>;

// ---------------------------------------------------------------------------
// JSX wrapping (ctx.wrap / patch/wrap) — SPEC §5, §7
// ---------------------------------------------------------------------------

/**
 * One JSX wrapper to apply to a component tree.
 *
 * `props` convention: a value that begins with `{` is emitted as a JSX
 * expression container verbatim — the author includes the container braces
 * (e.g. `"{{ flex: 1 }}"` → `style={{ flex: 1 }}`, `"{true}"` → `prop={true}`).
 * Any other value becomes a string-literal attribute (`"x"` → `title="x"`).
 */
export interface WrapSpec {
  /** The wrapper component's local name, e.g. "HeroUIProvider". */
  component: string;
  /** Module the component is imported from, e.g. "@heroui/react". */
  from: string;
  /** JSX props to place on the wrapper (see convention above). */
  props?: Record<string, string>;
  /** Import shape for the component. Default: "named". */
  import?: "named" | "default";
}

/** The config files `ctx.configFile` can resolve. */
export type ConfigFileKind = "vite" | "tailwind" | "tsconfig" | "next" | "metro";

/** The default export shape of an authored setup.ts. */
export type SetupFn = (ctx: Ctx, answers: Answers) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Config edit descriptor (for ctx.patchConfig / patch engine)
// ---------------------------------------------------------------------------

export interface ConfigEdit {
  /** Ensure `import <local> from "<source>"` exists. Keyed local -> source. */
  ensureImport?: Record<string, string>;
  /** Push `value` (raw expression string) into an array at `path`, if absent. */
  addToArray?: { path: string; value: string };
  /** Deep-merge into the default-export object. */
  merge?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ctx — reads immediate, writes deferred (SPEC §5)
// ---------------------------------------------------------------------------

export interface EnsureLineOpts {
  position?: "top" | "bottom";
  /** Insert immediately after the first line matching this exact (normalized) text. */
  after?: string;
}

/**
 * Import to ensure in a JS/TS file (see `ctx.ensureImport`). Shapes combine:
 * - `{ import }` → a side-effect import `import "<import>";`.
 * - `{ named, from }` → `import { ...named } from "<from>";` (merged into an
 *   existing import from that module if present).
 * - `{ default, from }` → `import <default> from "<from>";`.
 * - `default` + `named` together → `import <default>, { ...named } from "<from>";`.
 * - `call` additionally appends `<call>;` if that statement is absent.
 */
export interface EnsureImportSpec {
  /** Module specifier for a side-effect import (`import "<import>";`). */
  import?: string;
  /** Named bindings to import from `from`, e.g. `["useState"]`. */
  named?: string[];
  /** Default binding to import from `from`, e.g. `"React"`. */
  default?: string;
  /** Module the `named`/`default` bindings are imported from. */
  from?: string;
  /** An initialization call statement to ensure exists, e.g. `"connectDB()"`. */
  call?: string;
}

/** Options for `ctx.setEnv`. */
export interface SetEnvOpts {
  /** Target env file (relative to appDir). Default: `ctx.envFile()`. */
  file?: string;
  /** Also seed `KEY=<value>` into the sibling `.env.example`. Default: false. */
  example?: boolean;
}

export interface Ctx {
  /** Absolute path to the app being modified (selected app in a monorepo, else project root). All relative paths you pass to `ctx` resolve against this. */
  readonly appDir: string;
  /** Absolute path to the monorepo root; equals `appDir` for single-app projects. Use for root-level files (root `package.json`, `turbo.json`). */
  readonly repoRoot: string;
  /** Prompt answers keyed by prompt `id` (same object passed to `setup`'s second arg). */
  readonly answers: Answers;

  // ── READS — run immediately; branch on the result ────────────────────────

  /**
   * Whether `path` (relative to `appDir`) exists on disk.
   * @example if (!ctx.exists("tsconfig.json")) ctx.addFile("tsconfig.json", "{}\n");
   */
  exists(path: string): boolean;
  /**
   * Parse a JSON file relative to `appDir`; `null` if missing or invalid.
   * @example const pkg = ctx.readJson("package.json") as { dependencies?: Record<string, string> } | null;
   */
  readJson(path: string): unknown | null;
  /**
   * Read a text file relative to `appDir`; `null` if missing.
   * @example const css = ctx.readText("src/index.css") ?? "";
   */
  readText(path: string): string | null;
  /**
   * Ask the user a question and await the answer. Side-effect-free, so safe for
   * conditional/follow-up questions; returns the prompt `default` under `--silent`.
   * @example const useIcons = await ctx.prompt({ id: "icons", type: "confirm", message: "Install icons?", default: true });
   */
  prompt(p: Prompt): Promise<unknown>;

  // SEMANTIC RESOLVERS (reads) — inspect disk immediately relative to appDir.
  // Deterministic priority order; the "create" variants also record deferred
  // writes. See SPEC §5.
  /**
   * Locate the app bootstrap/entry file. Returns the best EXISTING match, or —
   * if none exist — the conventional default for the app's language/framework
   * (so a create-flow can `addFile` it). The returned path may not exist yet.
   */
  entryFile(): string;
  /**
   * Locate the global stylesheet: a `.css` imported by the entry, else a common
   * name. If missing and `createIfMissing`, records `addFile(<css>, "")` +
   * `ensureImport(entryFile(), <css>)` to wire it and returns the path; if
   * missing and not creating, returns the conventional default (may not exist).
   */
  stylesheet(opts?: { createIfMissing?: boolean }): string;
  /** Resolve a real config file (with its extension), or null if none exists. */
  configFile(kind: ConfigFileKind): string | null;
  /** First existing path among `candidates`, or null. */
  find(candidates: string[]): string | null;
  /**
   * Resolve the app's env file: an existing `.env` relative to `appDir`, else the
   * conventional default `.env` (which may not exist yet). The default target for
   * `setEnv`.
   * @example ctx.setEnv("REDIS_URL", "redis://localhost:6379", { file: ctx.envFile() });
   */
  envFile(): string;
  /**
   * First existing path among `candidates`; else record `addFile(defaultPath,
   * initialContent ?? "")` and return `defaultPath`.
   */
  findOrCreate(
    candidates: string[],
    defaultPath: string,
    initialContent?: string,
  ): string;

  // WRITES — recorded into the Plan; applied only on commit.
  install(pkgs: string[]): void;
  installDev(pkgs: string[]): void;
  copy(from: string, to: string): void;
  addFile(to: string, content: string): void;
  patchJson(file: string, merge: Record<string, unknown>): void;
  patchConfig(file: string, edit: ConfigEdit): void;
  ensureLine(file: string, line: string, opts?: EnsureLineOpts): void;
  /**
   * Env-aware upsert of `KEY=value`. **Never overwrites an existing non-empty
   * value** — if `KEY` already holds a value, this is a no-op (the developer's
   * value is preserved); if `KEY` is absent or empty (`KEY=`), it is set. The
   * file is created if missing. Idempotent and CRLF-safe.
   * @example ctx.setEnv("DATABASE_URL", "postgres://localhost:5432/app");
   * @example // also seed a committed template:
   * ctx.setEnv("REDIS_URL", "redis://localhost:6379", { example: true });
   */
  setEnv(key: string, value: string, opts?: SetEnvOpts): void;
  /**
   * Ensure an `import` exists in a JS/TS file (side-effect, named, and/or
   * default), optionally appending an init `call`. Idempotent, CRLF-safe, and
   * position-aware (placed near existing imports; merged into an existing import
   * from the same module).
   * @example ctx.ensureImport("src/main.tsx", { named: ["QueryClientProvider"], from: "@tanstack/react-query" });
   * @example ctx.ensureImport("src/main.tsx", { default: "theme", from: "./theme" });
   * @example ctx.ensureImport("src/server.ts", { named: ["connectDB"], from: "./config/mongo", call: "connectDB()" });
   * @example ctx.ensureImport("vite.config.ts", { import: "./styles.css" }); // side-effect
   */
  ensureImport(file: string, spec: EnsureImportSpec): void;
  /**
   * Wrap the app's root JSX in one or more components (format-preserving
   * codemod). An array nests outermost-first. Unresolvable targets never
   * corrupt the file — they surface a manual-step warning instead (SPEC §5).
   */
  wrap(file: string, wrappers: WrapSpec | WrapSpec[]): void;
  setScript(name: string, command: string): void;
  /** Requires capabilities.exec. Effect is opaque → weak plan (command string only). */
  run(cmd: string): void;

  /**
   * Surface a manual step the plugin cannot fully automate (e.g. "wrap your app
   * in the Provider"). Collected and reported in `ApplyResult.warnings` — never
   * a write, so it is safe to call unconditionally.
   */
  warn(message: string): void;
}

// ---------------------------------------------------------------------------
// Ops (recorded write primitives) — the on-disk realizations of ctx writes
// ---------------------------------------------------------------------------

export type Op =
  | { op: "installDeps"; packages: string[]; dev: boolean }
  | { op: "addFile"; to: string; content: string }
  | { op: "patchJson"; file: string; merge: Record<string, unknown> }
  | { op: "patchConfig"; file: string; edit: ConfigEdit }
  | { op: "ensureLine"; file: string; line: string; opts?: EnsureLineOpts }
  | { op: "setEnv"; file: string; key: string; value: string }
  | {
      op: "ensureImport";
      file: string;
      import?: string;
      named?: string[];
      default?: string;
      from?: string;
      call?: string;
    }
  | { op: "wrap"; file: string; wrappers: WrapSpec[] }
  | { op: "setScript"; name: string; command: string }
  | { op: "run"; cmd: string };

// ---------------------------------------------------------------------------
// Plan (what will happen — shown for consent before commit)
// ---------------------------------------------------------------------------

export interface PlanStep {
  kind: Op["op"];
  /** One-line human-readable summary. */
  summary: string;
  file?: string;
  /** Unified-diff-ish preview for file changes (never opaque base64). */
  diff?: string;
  detail: Op;
}

export interface Plan {
  plugin: string;
  steps: PlanStep[];
  installs: { packages: string[]; dev: string[] };
  /** exec commands, if any (weak-guarantee ops). */
  commands: string[];
  capabilities: Capability[];
  /** Manual steps surfaced via `ctx.warn` — carried through to ApplyResult. */
  warnings: string[];
  requiresConfirmation: boolean;
  /** Hash of this exact Plan; used by the MCP consent handshake (SPEC §8). */
  confirmToken?: string;
}

// ---------------------------------------------------------------------------
// Patch engine (pure, idempotent, CRLF-safe — SPEC §6)
// ---------------------------------------------------------------------------

/** Result of a pure patch function: given content in, changed content out. */
export interface PatchResult {
  /** false ⇒ idempotent no-op (already applied). */
  changed: boolean;
  content: string;
}

// ---------------------------------------------------------------------------
// Sandbox (SPEC §7) — the only bridge between plugin code and the host
// ---------------------------------------------------------------------------

export interface Sandbox {
  /**
   * Run bundled setup() source with the given ctx and answers.
   * Pure computation is free; every effect must go through ctx.
   * v1 may use an in-process implementation for first-party plugins; a true
   * WASM/QuickJS isolate is required before untrusted plugins run unattended.
   */
  run(setupSource: string, ctx: Ctx, answers: Answers): Promise<void>;
}

// ---------------------------------------------------------------------------
// Transaction (SPEC §6.6)
// ---------------------------------------------------------------------------

export interface Transaction {
  /** Snapshot a file before it is mutated (idempotent per path). */
  track(absPath: string): Promise<void>;
  /** Commit — discard snapshots. */
  commit(): Promise<void>;
  /** Restore every tracked file to its snapshot. */
  rollback(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Result of applying a plugin (returned to CLI/MCP; serialized for --json)
// ---------------------------------------------------------------------------

export interface ApplyResult {
  status: "success" | "rolled_back" | "confirmation_required";
  plugin: string;
  installed: string[];
  created: string[];
  modified: string[];
  commands: string[];
  warnings: string[];
  /** Present when status === "confirmation_required". */
  confirmToken?: string;
  plan?: Plan;
}
