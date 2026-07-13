# XInit — v1 Specification (frozen)

This document is the **frozen v1 contract**. New ideas go in [`FUTURE.md`](./FUTURE.md),
not here. The point of freezing is to ship a stable first release instead of
chasing scope.

---

## 1. What XInit is

A **deterministic project operations engine**. It detects a project and safely
mutates it (add/configure a technology) as an idempotent, reversible operation.
Scaffolding a new project is a special case of the same engine.

**Moat:** determinism, idempotency, transactional rollback, and machine-readable
project state — the guarantees a docs-augmented AI still can't give. *Not*
"knowing the install steps."

## 2. Architecture

One **core** with no I/O opinions; thin front-ends over it.

```
core  (pure API + event emitter — never prints, never prompts)
 ├─ detect/   project fingerprint → Project model
 ├─ patch/    idempotent, format-preserving file surgery
 ├─ tx/       snapshot → apply → commit | rollback
 ├─ plugin/   load, resolve deps/conflicts, run setup, build Plan, apply
 └─ api.ts    addPlugin() · detect() · doctor() · graph()
```

**Hard rule:** `core` must never import a prompt library or call `console.log`.
It returns data and emits events. If a feature can only work in the wizard, the
design has failed. This is what keeps CLI and MCP at parity.

## 3. Core data model

### Project (output of `detect()`)
```jsonc
{
  "root": "/repo",
  "kind": "monorepo",            // "single" | "monorepo"
  "manager": "pnpm+turbo",       // pnpm | npm | yarn | bun | uv | poetry | ...
  "confidence": 0.9,             // detection is heuristic; low → CLI asks to confirm
  "apps":     [{ "name": "web", "path": "apps/web", "language": "ts",
                 "framework": "next", "plugins": ["tailwind", "shadcn"] }],
  "packages": [{ "name": "ui",  "path": "packages/ui", "language": "ts" }]
}
```

### PluginManifest (the "facts" — `plugin.json`)
```jsonc
{
  "schemaVersion": 1,
  "name": "heroui",
  "displayName": "HeroUI v3",
  "version": "1.0.0",
  "appliesTo": { "framework": "react" },
  "languages": ["ts", "js"],           // supported app languages; omit ⇒ no restriction
  "dependsOn": ["tailwind-v4"],
  "conflicts": [],
  "requires": { "react": ">=19", "tailwindcss": ">=4" },
  "capabilities": { "install": true, "exec": false, "network": false },
  "detect": { "dependency": "@heroui/react" },   // UX only (see §6)
  "prompts": [
    { "id": "icons", "type": "confirm", "message": "Install icons?", "default": true }
  ]
}
```
A **packed** plugin (single distributable JSON) additionally carries:
- `files`: `{ "<path>": "<base64>" }` — templates inlined
- `setup`: `"<bundled setup() source as a string>"`

**`languages`** (optional `Language[]`, one of `"ts" | "js" | "python"`) declares
which app languages the plugin supports. **Omitted ⇒ no restriction** (universal).
Present ⇒ the plugin is compatible only when the target app's `language` is in the
list. Compatibility filtering (CLI `manage`, MCP `list_plugins`/`search_plugins`)
excludes a plugin whose `languages` does not include the app's language.

## 4. Plugins: folder in, single JSON out

Authored as a folder; shipped as one pasteable JSON.

```
myplugin/
  plugin.json    facts (metadata + prompts). Never holds logic.
  setup.ts       logic. Plain code, plain `if`. Optional (pure-install plugins skip it).
  files/         templates to copy.
```

`xinit pack ./myplugin` → `myplugin.json`:
- bundles `setup.ts` with esbuild (inlines local imports) → `setup` string
- base64-encodes `files/` → `files` map

> **The governing rule: JSON holds facts, code holds logic.** We do **not** encode
> conditionals/loops/feature-selection as a JSON DSL (`when`/`vars`/`features`) —
> that path leads to unreadable, permutation-heavy files. Options are `if`
> statements in `setup.ts`; that is linear in the number of options, not
> combinatorial.

### setup.ts contract
```ts
export default async function setup(ctx: Ctx, answers: Answers): Promise<void> {
  const ext = answers.ts ? "tsx" : "jsx";
  ctx.copy(`files/App.${ext}`, `src/App.${ext}`);
  ctx.install(["react", "react-dom"]);
  if (answers.tailwind) {
    ctx.installDev(["tailwindcss", "@tailwindcss/vite"]);
    ctx.patchConfig(`vite.config.${answers.ts ? "ts" : "js"}`, {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });
    ctx.ensureLine("src/index.css", '@import "tailwindcss";', { position: "top" });
  }
}
```

## 5. Execution model — reads immediate, writes deferred

The tension: we want a **dry-run plan + consent** *and* imperative code that can
branch on real state. Resolution: split `ctx`.

- **Reads run immediately** (`ctx.exists`, `ctx.readJson`, `ctx.readText`,
  `ctx.prompt`) — so `setup()` can branch on actual project state. Prompts are
  side-effect-free, so conditional/follow-up prompts live here (not a JSON DSL).
- **Writes are recorded, not applied** (`ctx.copy`, `ctx.addFile`, `ctx.install`,
  `ctx.installDev`, `ctx.patchJson`, `ctx.patchConfig`, `ctx.ensureLine`,
  `ctx.ensureImport`, `ctx.setScript`, `ctx.run`). Running `setup()` produces a
  **Plan**; nothing touches disk until the Plan is approved and committed.

`ctx.run` (arbitrary exec) is the one weak spot: its effect is opaque, so its
plan entry is just the **command string**, not a diff. Documented tradeoff:
**exec plugins get a weaker safety guarantee than patch plugins.**

### Ctx surface
```ts
interface Ctx {
  readonly appDir: string;    // selected app root
  readonly repoRoot: string;  // monorepo root (may equal appDir)
  readonly answers: Answers;

  // READS (immediate)
  exists(path: string): boolean;
  readJson(path: string): unknown | null;
  readText(path: string): string | null;
  prompt(p: Prompt): Promise<unknown>;

  // SEMANTIC RESOLVERS (reads; deterministic priority order) — solve "location varies"
  entryFile(): string;                         // best existing bootstrap, else conventional default
  stylesheet(opts?: { createIfMissing?: boolean }): string;  // global CSS; can create+wire
  configFile(kind: "vite"|"tailwind"|"tsconfig"|"next"|"metro"|"pyproject"): string | null;
  find(candidates: string[]): string | null;  // first existing
  findOrCreate(candidates: string[], defaultPath: string, initialContent?: string): string;
  envFile(): string;                           // existing `.env`, else conventional default `.env`

  // WRITES (deferred → Plan → applied on commit)
  install(pkgs: string[]): void;
  installDev(pkgs: string[]): void;
  copy(from: string, to: string): void;
  addFile(to: string, content: string): void;
  patchJson(file: string, merge: Record<string, unknown>): void;
  patchToml(file: string, merge: Record<string, unknown>): void;  // Python's patchJson (pyproject.toml)
  patchConfig(file: string, edit: ConfigEdit): void;
  ensureLine(file: string, line: string, opts?: { position?: "top" | "bottom"; after?: string }): void;
  setEnv(key: string, value: string, opts?: { file?: string; example?: boolean }): void;  // env-aware upsert
  ensureImport(file: string, spec: {                 // side-effect / named / default import
    import?: string; named?: string[]; default?: string; from?: string; call?: string;
  }): void;
  wrap(file: string, wrappers: WrapSpec | WrapSpec[]): void;  // JSX provider-wrapping codemod
  setScript(name: string, command: string): void;
  run(cmd: string): void;              // requires capabilities.exec
}
```

**Semantic resolvers** inspect disk immediately (relative to `appDir`) and return
a *relative path*, resolving deterministically by priority so plugins never
hardcode `"src/index.css"` or `"vite.config.ts"`:
- `entryFile()` — **Python-aware**: when the app is Python (a `pyproject.toml` /
  `requirements.txt` / `setup.py` exists, or a `.py` entry is present) it resolves
  a Python bootstrap by priority (`main.py`, `app.py`, `src/main.py`,
  `__main__.py`, `manage.py`), defaulting to `main.py`. Otherwise: package.json
  `main`/`module` if it exists, then a JS priority list
  (`src/main.{tsx,jsx,ts,js}`, `src/index.{tsx,ts,jsx,js}`, `index.{tsx,ts,js}`,
  `App.{tsx,jsx,js}`, RN `index.js`). Returns the best EXISTING match; if none
  exist, the conventional default for the language/framework (so a create-flow can
  `addFile` it — **the returned path may not exist yet**).
- `stylesheet({ createIfMissing? })` — a `.css` imported by the entry, else a
  common name (`src/index.css`, `src/global.css`, …). If missing and
  `createIfMissing`, records `addFile(<css>, "")` + `ensureImport(entryFile(), <css>)`
  to wire it and returns the path (later `ensureLine` calls compose onto it via the
  plan overlay). If missing and not creating, returns the conventional default.
- `configFile(kind)` — the real config file with its extension, or `null`.
- `find` / `findOrCreate` — generic first-existing / first-existing-else-create.
- `envFile()` — an existing `.env` relative to `appDir`, else the conventional
  default `.env` (the default target for `setEnv`; the path may not exist yet).

**`ctx.setEnv(key, value, opts?)`** — an env-aware upsert of `KEY=value` into
`.env` (or `opts.file`). Its defining rule is **never overwrite an existing
non-empty value**: if `KEY` already holds a value the developer set, `setEnv` is a
no-op; if `KEY` is absent or present-but-empty (`KEY=`), it is set. The file is
created if missing. Idempotent and CRLF-safe (via the pure `upsertEnv` patch fn,
which quotes values containing spaces/special chars). `opts.example: true` also
seeds `KEY=<value>` into the sibling `.env.example` under the same rules — one
`setEnv` records one op for `.env` and one for `.env.example`.

**`ctx.ensureImport(file, spec)`** — ensure an `import` exists (idempotent,
CRLF-safe, position-aware). `spec` supports side-effect, named, and default
shapes: `{ import: "x" }` → `import "x";`; `{ named: ["a","b"], from: "m" }` →
`import { a, b } from "m";` (merged into an existing import from `m`);
`{ default: "X", from: "m" }` → `import X from "m";`; `default` + `named` together
→ `import X, { a } from "m";`. An optional `call` appends the call statement if
absent (e.g. `{ named: ["connectDB"], from: "./config/mongo", call: "connectDB()" }`).

**`ctx.wrap(file, wrappers)`** — a format-preserving JSX codemod (recast +
`@babel/parser`) that wraps the app root in provider components. It targets the
first JSX argument of a `createRoot(...).render(<X/>)` / `ReactDOM.render(<X/>)`
call, else the JSX returned by the default-exported component. `WrapSpec =
{ component, from, props?, import? }` (`import` default `"named"`); an **array
nests outermost-first**. The needed import is added idempotently. **props
convention:** a value beginning with `{` is emitted as a JSX expression container
verbatim — the author includes the container braces (`"{{ flex: 1 }}"` →
`style={{ flex: 1 }}`, `"{true}"` → `prop={true}`); any other value becomes a
string-literal attribute (`"x"` → `title="x"`). `wrap` is **idempotent** (a tree
already wrapped by the outermost component is a no-op; wrappers already present are
skipped) and **never corrupts the file**: if neither a render site nor a
default-component return can be found, the file is left untouched and a manual-step
warning (`"Could not auto-wrap <file>; wrap manually with <components>"`) is pushed
into `ApplyResult.warnings` — exactly like `ctx.warn`.

**`ctx.patchToml(file, merge)`** — Python's `patchJson`: a format-preserving,
idempotent deep-merge into a TOML file (`pyproject.toml`). A fully-present merge
returns the original bytes untouched (comments/formatting preserved); an actual
change is re-serialized with the file's own EOL. Recorded, planned (diff) and
applied like every other write op.

**Manager-aware install.** `ctx.install`/`ctx.installDev` are recorded
manager-agnostically; at apply time the app's package manager is detected from
`appDir` and threaded to the installer (`InstallSpec.manager`), which builds the
command via the shared `installCommands(manager, deps, devDeps)` helper. So a
Python app on `uv` runs `uv add <deps>` / `uv add --dev <dev>`, `poetry` runs
`poetry add` / `poetry add --group dev`, `pip` runs `pip install` (no dev split),
and JS apps run `pnpm add` / `npm install -D` / `yarn add` / `bun add -d` as
appropriate. Unknown managers default to pnpm.

### Plan
```jsonc
{
  "plugin": "heroui",
  "installs": { "packages": ["@heroui/styles", "@heroui/react"], "dev": ["@tailwindcss/vite"] },
  "steps": [ { "kind": "patchConfig", "file": "vite.config.ts", "summary": "...", "diff": "..." } ],
  "commands": [],                       // exec commands, if any
  "capabilities": ["install"],
  "requiresConfirmation": false,
  "confirmToken": null                  // set for MCP handshake (§8)
}
```

## 6. Idempotency & safety (implementation rules)

These are contract-level requirements, not nice-to-haves:

1. **`detect` is UX only** — it lists installed plugins for the wizard. It is
   **not** the idempotency mechanism. A plugin that crashed mid-run leaves the
   dependency present but the project half-patched; `detect` would wrongly say
   "done." Safety comes from #2, not `detect`.
2. **Every write op is independently idempotent** — re-running no-ops if already
   applied (`ensureLine` skips a present line; `addToArray` skips a present
   entry; `install` skips a satisfied dep).
3. **Line endings are normalized before compare/insert.** A CRLF file checked
   against an LF line must still match, or `ensureLine`/`ensureImport` duplicate
   on every run. (Primary dev platform is Windows — this bug is real.)
4. **AST inserts are position-aware.** Import order can be load-bearing
   (tailwind `@import` must precede heroui's). Never blind-append.
5. **Installs are batched** — collect all deps across the resolved plan, install
   once at commit, workspace-aware (`pnpm add --filter <app>`).
6. **Transaction** — snapshot every file an op will touch, plus `package.json` +
   lockfile, before applying. On any failure, restore. Refuse to run on a dirty
   git tree without `--force`.

## 7. Plugin sandbox & capabilities — "computation is free, effects are capabilities"

`setup()` runs in a sandbox. Pure JS (Math, JSON, strings, loops, `if`) is
always allowed. Every way of touching the outside world is a **capability**,
declared in `plugin.json`, surfaced in the Plan, and gated by consent.

| The code wants to… | Allowed? |
| --- | --- |
| Math / string / loop / `if` / JSON | ✅ always (pure) |
| `console.log` | ✅ captured (routed to a log channel; never raw stdout — would corrupt `--json`) |
| install a package | ⚠️ via `ctx.install` + `capabilities.install`; recorded + reversible |
| run a command (exec) | ⚠️ via `ctx.run` + `capabilities.exec` + consent; only weak plan |
| read/write files | ⚠️ via `ctx.*`; recorded → dry-run + rollback |
| network / `fetch` | ⚠️ requires `capabilities.network` + consent |
| `require('child_process')`, `fs`, `process`, arbitrary `import` | ❌ blocked entirely |

**Sandbox requirement:** Node's built-in `vm` is *not* a security boundary
(known escapes). For untrusted pasted code, the sandbox MUST be a true isolate —
**QuickJS→WASM** (no access to Node internals) or a locked-down child process.
`ctx` is the only bridge in/out. (v1 may ship an in-process stub behind the
`Sandbox` interface for first-party plugins, but the isolate is required before
open third-party plugins run unattended. Tracked in `FUTURE.md`.)

> **Open ≠ unrestricted.** Anyone may publish/paste a plugin (low friction), but
> pasted code can *compute* freely and can only *touch* the machine through
> declared, consented capabilities.

## 8. Interfaces

### CLI
```
xinit                      # detect + interactive wizard
xinit create [template]    # scaffold new project/app
xinit detect  [--json]     # print Project model
xinit add <plugin> [--json] [--silent] [--yes]
xinit manage               # manage apps → app → plugins  (add/configure; no remove in v1)
xinit doctor  [--json]     # report drift vs manifest (does NOT fix in v1)
xinit pack <dir>           # author folder → single distributable JSON
xinit make <entry>         # compile a typed plugin.ts → single distributable JSON
```
(A dependency-graph view is exposed via the MCP `get_graph` tool, not a CLI command.)
Navigation (wizard): repo → (Manage Apps | Manage Packages) → app →
(Add plugin | Configure plugin) → plugin asks its prompts → Plan → confirm → apply.
`--silent` requires all prompt answers via flags/JSON or defaults; errors if a
required prompt has no default.

### MCP tools
`detect_project` · `list_plugins` · `search_plugins` · `add_plugin` ·
`doctor` · `get_graph` (6 tools). Each is a thin call into the same core.

### Consent handshake (AI mode)
No interactive prompt exists for an agent, so "are you sure?" becomes a required
second call:

| Case | Behavior |
| --- | --- |
| first-party (official) | run immediately |
| third-party, install-only (no `exec`/`network`) | run immediately, flagged in response |
| third-party needing `exec` or `network` | **do not run** → return `{ status: "confirmation_required", plan, confirmToken }`; agent re-calls `add_plugin(name, confirm: <token>)` to proceed |

`confirmToken` is a hash of the exact computed Plan, so a confirmation cannot be
replayed against a different action. With the sandbox, this is the full defense
when no human is in the loop.

## 9. Dependency & conflict resolution (v1: simple)

`dependsOn` may reference other plugins (installing heroui can pull the
tailwind-v4 plugin, whose prompts are gathered up front). `conflicts` and
`requires` (semver ranges) are checked. v1 resolves linearly and **fails loudly**
on conflict / unmet `requires` — no automatic version negotiation. All transitive
prompts are collected before a single consolidated Plan + one consent.

## 10. Languages in v1

- **JS/TS (deep):** full patch surgery — `package.json`, `tsconfig.json`,
  `vite/next/tailwind` configs (magicast), CSS.
- **Python (medium):** a working install/pyproject/entry story. Detect
  `uv`/`poetry`/`pip` and dispatch installs with the right syntax
  (`uv add` / `poetry add` / `pip install`) via manager-aware install (§5);
  deep-merge `pyproject.toml` (format-preserving TOML) with `ctx.patchToml`;
  resolve the app entry (`main.py`, `app.py`, `src/main.py`, `__main__.py`,
  `manage.py`) with a Python-aware `ctx.entryFile()`; `ctx.configFile("pyproject")`;
  plus `setEnv`, `ensureLine`, `copy`, and `run`. **No `.py` source AST surgery**
  in v1 (no good Node-side Python AST); documented limitation. Note: XInit is a
  Node CLI — standalone binaries for non-Node audiences are a `FUTURE.md` item.

## 11. Non-goals for v1 (see FUTURE.md)

`remove` / `update` migrations · C++ · signed registry · REST API · WASM isolate
hardening for unattended third-party plugins · deep Python source rewriting.
