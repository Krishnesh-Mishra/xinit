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

export interface Ctx {
  readonly appDir: string;
  readonly repoRoot: string;
  readonly answers: Answers;

  // READS — run immediately; setup() may branch on the result.
  exists(path: string): boolean;
  readJson(path: string): unknown | null;
  readText(path: string): string | null;
  prompt(p: Prompt): Promise<unknown>;

  // WRITES — recorded into the Plan; applied only on commit.
  install(pkgs: string[]): void;
  installDev(pkgs: string[]): void;
  copy(from: string, to: string): void;
  addFile(to: string, content: string): void;
  patchJson(file: string, merge: Record<string, unknown>): void;
  patchConfig(file: string, edit: ConfigEdit): void;
  ensureLine(file: string, line: string, opts?: EnsureLineOpts): void;
  ensureImport(file: string, spec: { import: string; call?: string }): void;
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
  | { op: "ensureImport"; file: string; import: string; call?: string }
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
