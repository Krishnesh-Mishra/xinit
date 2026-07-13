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
  Ctx,
  EnsureLineOpts,
  Op,
  Prompt,
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
