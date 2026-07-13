# `ctx` API reference

The complete toolbox passed to a plugin's `setup(ctx, answers)`. Every effect a
plugin has on a project goes through `ctx` — never `fs`, `process`, or
`child_process`. Signatures below are verbatim from
`packages/core/src/types.ts` (the `Ctx` interface and supporting types).

**The core split (see [execution-model.md](./execution-model.md)):**

- **Reads run immediately** — so `setup()` can branch on real project state.
- **Writes are recorded**, not applied — they accumulate into a **Plan** and touch
  disk only after the Plan is approved and committed, inside a transaction.

Contents:

- [Context](#context) — `appDir`, `repoRoot`, `answers`
- [Reads](#reads) — `exists`, `readJson`, `readText`, `prompt`
- [Resolvers](#resolvers) — `entryFile`, `stylesheet`, `configFile`, `find`, `findOrCreate`, `envFile`
- [Writes](#writes) — `install`, `installDev`, `copy`, `addFile`, `patchJson`, `patchConfig`, `patchToml`, `ensureLine`, `setEnv`, `ensureImport`, `wrap`, `setScript`, `run`, `warn`
- [Supporting types](#supporting-types) — `ConfigEdit`, `EnsureImportSpec`, `WrapSpec`, `SetEnvOpts`, `EnsureLineOpts`, `Prompt`

---

## Context

Read-only properties describing where the plugin is operating.

### `appDir`

```ts
readonly appDir: string;
```

Absolute path to the app being modified (the selected app in a monorepo, else the
project root). **All relative paths you pass to `ctx` resolve against `appDir`.**

### `repoRoot`

```ts
readonly repoRoot: string;
```

Absolute path to the monorepo root; **equals `appDir` for single-app projects**.
Use it for root-level files (root `package.json`, `turbo.json`).

### `answers`

```ts
readonly answers: Answers;   // Record<string, unknown>
```

Prompt answers keyed by prompt `id` — the same object passed as `setup`'s second
argument. Values are `unknown`; coerce defensively.

---

## Reads

Run immediately and return a value, so you can branch on real state.

### `exists`

```ts
exists(path: string): boolean;
```

Whether `path` (relative to `appDir`) exists on disk.

```ts
if (!ctx.exists("tsconfig.json")) ctx.addFile("tsconfig.json", "{}\n");
```

### `readJson`

```ts
readJson(path: string): unknown | null;
```

Parse a JSON file relative to `appDir`; `null` if missing or invalid. Cast to the
shape you expect.

```ts
const pkg = ctx.readJson("package.json") as { dependencies?: Record<string, string> } | null;
```

### `readText`

```ts
readText(path: string): string | null;
```

Read a text file relative to `appDir`; `null` if missing.

```ts
const css = ctx.readText("src/index.css") ?? "";
```

### `prompt`

```ts
prompt(p: Prompt): Promise<unknown>;
```

Ask the user a question and await the answer. **Side-effect-free**, so it's safe
for conditional/follow-up questions inside `setup()`. Returns the prompt's
`default` under `--silent`. (For up-front questions, prefer the declared `prompts`
manifest field.)

```ts
const useIcons = await ctx.prompt({
  id: "icons", type: "confirm", message: "Install icons?", default: true,
});
```

---

## Resolvers

Semantic reads that inspect disk immediately (relative to `appDir`) and return a
**relative path**, resolving deterministically by priority — so plugins never
hardcode `"src/index.css"` or `"vite.config.ts"`. The `create` variants also
record a deferred write.

### `entryFile`

```ts
entryFile(): string;
```

Locate the app bootstrap/entry file. Returns the best **existing** match, or — if
none exist — the conventional default for the app's language/framework (so a
create-flow can `addFile` it). **The returned path may not exist yet.**

- **JS/TS priority:** `package.json` `main`/`module` if present, then
  `src/main.{tsx,jsx,ts,js}`, `src/index.{tsx,ts,jsx,js}`, `index.{tsx,ts,js}`,
  `App.{tsx,jsx,js}`, React Native `index.js`.
- **Python-aware:** when the app is Python it resolves a Python bootstrap by
  priority (`main.py`, `app.py`, `src/main.py`, `__main__.py`, `manage.py`),
  defaulting to `main.py`.

```ts
const entry = ctx.entryFile();
ctx.wrap(entry, { component: "QueryClientProvider", from: "@tanstack/react-query", props: { client: "{queryClient}" } });
```

### `stylesheet`

```ts
stylesheet(opts?: { createIfMissing?: boolean }): string;
```

Locate the global stylesheet: a `.css` imported by the entry, else a common name
(`src/index.css`, `src/global.css`, …).

- If missing and `createIfMissing`, it records `addFile(<css>, "")` +
  `ensureImport(entryFile(), <css>)` to wire it, and returns the path (later
  `ensureLine` calls compose onto it via the plan overlay).
- If missing and **not** creating, returns the conventional default (may not
  exist).

```ts
const css = ctx.stylesheet({ createIfMissing: true });
ctx.ensureLine(css, '@import "tailwindcss";', { position: "top" });
```

### `configFile`

```ts
configFile(kind: "vite" | "tailwind" | "tsconfig" | "next" | "metro" | "pyproject"): string | null;
```

Resolve a real config file (with its actual extension), or `null` if none exists.
Pair with a fallback when you want to create one.

```ts
ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", { /* ... */ });
const pyproject = ctx.configFile("pyproject");   // string | null
```

### `find`

```ts
find(candidates: string[]): string | null;
```

First existing path among `candidates`, or `null`.

```ts
const server = ctx.find(["src/server.ts", "src/index.ts", "server.js"]);
```

### `findOrCreate`

```ts
findOrCreate(candidates: string[], defaultPath: string, initialContent?: string): string;
```

First existing path among `candidates`; else record `addFile(defaultPath,
initialContent ?? "")` and return `defaultPath`. **Idempotent:** when a candidate
already exists it is left untouched (no write recorded).

```ts
ctx.findOrCreate(["pyproject.toml"], "pyproject.toml",
  `[project]\nname = "app"\nversion = "0.1.0"\ndependencies = []\n`);
```

### `envFile`

```ts
envFile(): string;
```

Resolve the app's env file: an existing `.env` relative to `appDir`, else the
conventional default `.env` (which may not exist yet). It is the default target
for `setEnv`.

```ts
ctx.setEnv("REDIS_URL", "redis://localhost:6379", { file: ctx.envFile() });
```

---

## Writes

Recorded into the Plan; applied only on commit. Each is independently idempotent
(re-running no-ops if already applied), CRLF-safe, and never blindly overwrites.
None of these return a value.

### `install`

```ts
install(pkgs: string[]): void;
```

Add runtime dependencies. Recorded manager-agnostically; at apply time the app's
manager is detected and the right command runs (`pnpm add` / `npm install` /
`yarn add` / `bun add`, or `uv add` / `poetry add` / `pip install` for Python).
Installs are batched and skip already-satisfied deps. Requires
`capabilities.install`.

```ts
ctx.install(["mongoose"]);
ctx.install(["django"]);   // Python: dispatched as `uv add django`, etc.
```

### `installDev`

```ts
installDev(pkgs: string[]): void;
```

Same as `install`, for dev dependencies (`npm install -D`, `bun add -d`,
`poetry add --group dev`; `pip` has no dev split).

```ts
ctx.installDev(["tailwindcss", "@tailwindcss/vite"]);
```

### `copy`

```ts
copy(from: string, to: string): void;
```

Copy a bundled template file. `from` is a path inside the plugin (conventionally
under `files/`, base64-inlined at pack time); `to` is relative to `appDir`.

```ts
ctx.copy("files/mongo.ts", "src/config/mongo.ts");
```

### `addFile`

```ts
addFile(to: string, content: string): void;
```

Create a file (relative to `appDir`) with computed/templated `content`. Use this
(not `copy`) when the content is generated in code.

```ts
ctx.addFile(".python-version", `${version}\n`);
```

### `patchJson`

```ts
patchJson(file: string, merge: Record<string, unknown>): void;
```

Deep-merge `merge` into a JSON file relative to `appDir` (e.g. `package.json`,
`tsconfig.json`). Idempotent — a fully-present merge is a no-op.

```ts
ctx.patchJson(ctx.configFile("tsconfig") ?? "tsconfig.json", {
  compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
});
```

### `patchConfig`

```ts
patchConfig(file: string, edit: ConfigEdit): void;
```

Structured, idempotent edit of a JS/TS config file (magicast) — the way to touch
`vite.config.ts`, `next.config.js`, etc. `edit` is a [`ConfigEdit`](#configedit):
`ensureImport`, `addToArray`, and/or `merge`. `addToArray` skips a value already
present (position-aware); `ensureImport` won't duplicate.

```ts
ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", {
  ensureImport: { tailwindcss: "@tailwindcss/vite" },
  addToArray: { path: "plugins", value: "tailwindcss()" },
});
```

### `patchToml`

```ts
patchToml(file: string, merge: Record<string, unknown>): void;
```

Python's `patchJson`: a format-preserving, idempotent deep-merge into a TOML file
(`pyproject.toml`) relative to `appDir`. A fully-present merge returns byte-identical
content (comments/formatting preserved); an actual change re-serializes with the
file's own EOL. The file is created if missing.

```ts
ctx.patchToml("pyproject.toml", { project: { dependencies: ["httpx"] } });
ctx.patchToml("pyproject.toml", { tool: { ruff: { "line-length": 100 } } });
```

### `ensureLine`

```ts
ensureLine(file: string, line: string, opts?: EnsureLineOpts): void;
```

Ensure an exact line exists in a text file (relative to `appDir`). Idempotent and
CRLF-safe — line endings are normalized before compare/insert, so a present line
is never duplicated. Position-aware via [`EnsureLineOpts`](#ensurelineopts):
`position: "top" | "bottom"` or `after: "<exact line>"`.

```ts
ctx.ensureLine(css, '@import "tailwindcss";', { position: "top" });
ctx.ensureLine(css, '@import "@heroui/styles";', { after: '@import "tailwindcss";' });
```

### `setEnv`

```ts
setEnv(key: string, value: string, opts?: SetEnvOpts): void;
```

Env-aware upsert of `KEY=value`. **Never overwrites an existing non-empty value** —
if `KEY` already holds a value, this is a no-op (the developer's value is
preserved); if `KEY` is absent or empty (`KEY=`), it is set. The file is created if
missing. Idempotent and CRLF-safe; values with spaces/special chars are quoted.
[`SetEnvOpts`](#setenvopts): `file` (target, default `ctx.envFile()`) and `example`
(also seed the sibling `.env.example`). One `setEnv` with `example: true` records
one op for `.env` and one for `.env.example`.

```ts
ctx.setEnv("DATABASE_URL", "postgres://localhost:5432/app");
ctx.setEnv("REDIS_URL", "redis://localhost:6379", { example: true });
```

### `ensureImport`

```ts
ensureImport(file: string, spec: EnsureImportSpec): void;
```

Ensure an `import` exists in a JS/TS file (side-effect, named, and/or default),
optionally appending an init `call`. Idempotent, CRLF-safe, and position-aware —
placed near existing imports, and **merged into an existing import from the same
module**. `spec` is [`EnsureImportSpec`](#ensureimportspec); the shapes:

| `spec` | Emits |
| --- | --- |
| `{ import: "./styles.css" }` | `import "./styles.css";` (side-effect) |
| `{ named: ["a", "b"], from: "m" }` | `import { a, b } from "m";` |
| `{ default: "X", from: "m" }` | `import X from "m";` |
| `{ default: "X", named: ["a"], from: "m" }` | `import X, { a } from "m";` |
| `{ named: ["connectDB"], from: "./config/mongo", call: "connectDB()" }` | the import **plus** `connectDB();` if absent |

```ts
ctx.ensureImport("src/main.tsx", { named: ["queryClient"], from: "./lib/queryClient" });
ctx.ensureImport("src/main.tsx", { default: "theme", from: "./theme" });
ctx.ensureImport("src/server.ts", { named: ["connectDB"], from: "./config/mongo", call: "connectDB()" });
ctx.ensureImport("vite.config.ts", { import: "./styles.css" });   // side-effect
```

### `wrap`

```ts
wrap(file: string, wrappers: WrapSpec | WrapSpec[]): void;
```

Wrap the app's root JSX in one or more provider components (a format-preserving
codemod: recast + `@babel/parser`). It targets the first JSX argument of a
`createRoot(...).render(<X/>)` / `ReactDOM.render(<X/>)` call, else the JSX
returned by the default-exported component. An **array nests outermost-first**. The
wrapper's import is added idempotently. `wrap` is idempotent (a tree already
wrapped by the outermost component is a no-op) and **never corrupts the file** — if
no render site or default-component return is found, the file is left untouched and
a manual-step warning is pushed into `ApplyResult.warnings`. See
[`WrapSpec`](#wrapspec) for the props convention.

```ts
ctx.wrap(entry, {
  component: "QueryClientProvider",
  from: "@tanstack/react-query",
  props: { client: "{queryClient}" },   // "{...}" ⇒ JSX expression container
});
```

> `wrap` imports only the **wrapper component**. Bindings referenced in `props`
> (like `queryClient`) are not imported for you — add them with `ensureImport`.

### `setScript`

```ts
setScript(name: string, command: string): void;
```

Add/update an npm script in `package.json` (`scripts[name] = command`), idempotently.

```ts
ctx.setScript("db:studio", "prisma studio");
```

### `run`

```ts
run(cmd: string): void;
```

Record an arbitrary shell command to run at apply time. **Requires
`capabilities.exec`.** Its effect is opaque, so its Plan entry is just the command
string (not a diff) — a weaker safety guarantee than patch ops (SPEC §5). Trips the
consent gate.

```ts
ctx.run("npx shadcn@latest init -d");
```

### `warn`

```ts
warn(message: string): void;
```

Surface a manual step the plugin cannot fully automate. Collected into
`ApplyResult.warnings`. **Never a write**, so it is safe to call unconditionally.

```ts
ctx.warn("Run 'python manage.py migrate' then 'python manage.py runserver'.");
```

---

## Supporting types

### `ConfigEdit`

Descriptor for `ctx.patchConfig`.

```ts
interface ConfigEdit {
  /** Ensure `import <local> from "<source>"` exists. Keyed local -> source. */
  ensureImport?: Record<string, string>;
  /** Push `value` (raw expression string) into an array at `path`, if absent. */
  addToArray?: { path: string; value: string };
  /** Deep-merge into the default-export object. */
  merge?: Record<string, unknown>;
}
```

```ts
ctx.patchConfig("vite.config.ts", {
  ensureImport: { path: "node:path" },
  merge: { resolve: { alias: { "@": "path.resolve(__dirname, './src')" } } },
});
```

### `EnsureImportSpec`

Descriptor for `ctx.ensureImport`. Shapes combine (see the table above).

```ts
interface EnsureImportSpec {
  import?: string;    // side-effect import: `import "<import>";`
  named?: string[];   // named bindings from `from`, e.g. ["useState"]
  default?: string;   // default binding from `from`, e.g. "React"
  from?: string;      // module the named/default bindings come from
  call?: string;      // init call to ensure, e.g. "connectDB()"
}
```

### `WrapSpec`

One JSX wrapper for `ctx.wrap`.

```ts
interface WrapSpec {
  component: string;                 // wrapper's local name, e.g. "HeroUIProvider"
  from: string;                      // module to import it from
  props?: Record<string, string>;   // JSX props (see convention)
  import?: "named" | "default";      // import shape; default "named"
}
```

**Props convention:** a value that begins with `{` is emitted as a JSX expression
container **verbatim** — you include the braces yourself:

| `props` value | Rendered attribute |
| --- | --- |
| `"{queryClient}"` | `client={queryClient}` |
| `"{{ flex: 1 }}"` | `style={{ flex: 1 }}` |
| `"{true}"` | `prop={true}` |
| `"x"` (no leading `{`) | `title="x"` (string literal) |

### `SetEnvOpts`

Options for `ctx.setEnv`.

```ts
interface SetEnvOpts {
  file?: string;      // target env file relative to appDir. Default: ctx.envFile()
  example?: boolean;  // also seed KEY=<value> into sibling .env.example. Default: false
}
```

### `EnsureLineOpts`

Options for `ctx.ensureLine`.

```ts
interface EnsureLineOpts {
  position?: "top" | "bottom";
  after?: string;   // insert immediately after the first line matching this exact (normalized) text
}
```

### `Prompt`

A declared question (manifest `prompts[]`) or an argument to `ctx.prompt`.

```ts
interface Prompt {
  id: string;
  type: "confirm" | "text" | "select" | "multiselect";
  message: string;
  default?: unknown;    // used under --silent
  choices?: string[];   // required for select/multiselect
}
```

---

**See also:** [authoring-plugins.md](./authoring-plugins.md) ·
[execution-model.md](./execution-model.md) · [examples.md](./examples.md) ·
[`../SPEC.md`](../SPEC.md) §5.
