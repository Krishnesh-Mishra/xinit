# Authoring initup plugins

Everything you need to write a correct plugin — typed and grounded in the real
API (`packages/core/src/plugin/define.ts`, `packages/core/src/types.ts`). Read
[ctx-reference.md](./ctx-reference.md) alongside this for the exact signature of
every `ctx` method, and [execution-model.md](./execution-model.md) for *why* the
API is shaped this way.

- [The governing rule: JSON = facts, code = logic](#the-governing-rule-json--facts-code--logic)
- [Two authoring forms](#two-authoring-forms)
- [Every manifest field](#every-manifest-field)
- [Prompts](#prompts)
- [Capabilities & honesty](#capabilities--honesty)
- [`files/` and `ctx.copy`](#files-and-ctxcopy)
- [Packing & distribution](#packing--distribution)
- [Best practices](#best-practices)
- [Python plugins](#python-plugins)
- [Full worked example](#full-worked-example)

---

## The governing rule: JSON = facts, code = logic

A plugin has two halves:

- **Facts** — metadata the engine reads *before* running anything: the name,
  what it applies to, what it depends on, what it's allowed to do, and the
  questions to ask. These are static and declarative.
- **Logic** — the actual transformation: plain code with plain `if`. This lives in
  `setup()`.

initup deliberately does **not** encode conditionals/loops/feature-selection as a
JSON DSL (`when`/`vars`/`features`). That path produces unreadable,
permutation-heavy files. Options are `if` statements in `setup()` — linear in the
number of options, not combinatorial.

> **JSON holds facts. Code holds logic.**

## Two authoring forms

Both compile to the **same** distributable artifact: one JSON carrying the
manifest facts, a bundled `setup` string, and base64-encoded `files`.

### A. Typed single file — `plugin.ts` (recommended)

One type-safe file that default-exports `definePlugin({ ...facts, setup })`. You
get author-time IntelliSense and type-checking on every field and every `ctx`
call. This is how all 31 first-party plugins are written.

```ts
import { definePlugin } from "@initup/core"; // the alias "initup" also works

export default definePlugin({
  name: "tailwind-v4",
  displayName: "Tailwind CSS v4",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "tailwindcss" },
  prompts: [],
  setup: async (ctx) => {
    ctx.installDev(["tailwindcss", "@tailwindcss/vite"]);
    ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });
    const css = ctx.stylesheet({ createIfMissing: true });
    ctx.ensureLine(css, '@import "tailwindcss";', { position: "top" });
  },
});
```

`definePlugin` is a typed identity — it returns its argument unchanged; the value
exists only so TypeScript can infer and check its type. (`pluginMake` is an
exported alias if it reads better for you.)

Compile it:

```bash
initup make plugins/tailwind-v4/plugin.ts   # → tailwind-v4.json
```

### B. Folder form — `plugin.json` + `setup.ts` + `files/`

The original form. Facts in JSON, logic in a sibling `setup.ts` that
default-exports `setup`, templates in `files/`.

```
myplugin/
  plugin.json    facts (metadata + prompts). Never holds logic.
  setup.ts       logic. Plain code, plain `if`. Optional (pure-install plugins skip it).
  files/         templates to copy.
```

```jsonc
// plugin.json
{
  "schemaVersion": 1,
  "name": "myplugin",
  "displayName": "My Plugin",
  "version": "1.0.0",
  "capabilities": { "install": true, "exec": false, "network": false }
}
```

```ts
// setup.ts
import type { Ctx, Answers } from "@initup/core";

export default async function setup(ctx: Ctx, answers: Answers): Promise<void> {
  ctx.install(["my-lib"]);
}
```

Compile it:

```bash
initup pack ./myplugin        # → myplugin.json
```

> Prefer the typed single file unless you have a reason not to — the type-checking
> catches whole classes of mistakes (wrong field names, wrong `ctx` call shapes)
> before you ever run `make`.

---

## Every manifest field

These are the fields of `PluginDefinition` (typed form) / `PluginManifest` (JSON
form). All the FACT fields are identical between the two forms; `schemaVersion`
(always `1`) and the packed-artifact fields (`files`, `setup`) are filled in by
`make`/`pack`, so you don't write them by hand in the typed form.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | ✅ | Unique plugin id, kebab-case (e.g. `"tailwind-v4"`). Referenced by other plugins' `dependsOn`/`conflicts`. |
| `displayName` | `string` | ✅ | Human-readable name shown in the wizard (e.g. `"Tailwind CSS v4"`). |
| `version` | `string` | — | Plugin version (semver). Conventionally `"1.0.0"`. |
| `appliesTo` | `{ type?: string; framework?: string }` | — | Where this plugin can be applied. Omitted ⇒ applies anywhere. |
| `languages` | `Language[]` (`"js"`\|`"ts"`\|`"python"`) | — | App languages supported. Omitted ⇒ universal; present ⇒ compatible only when the target app's `language` is in the list. |
| `dependsOn` | `string[]` | — | Other plugins that must be present first; initup offers to add missing ones (their prompts are gathered up front). |
| `conflicts` | `string[]` | — | Plugins that cannot coexist; resolution fails loudly if present. |
| `requires` | `Record<string, string>` | — | Required versions of already-installed deps as semver ranges. Unmet ⇒ error. |
| `capabilities` | `Capabilities` | ✅ | What the plugin is allowed to do: `{ install, exec, network }`, all `boolean`. Be honest — see below. |
| `detect` | `{ dependency: string } \| { file: string }` | — | How to tell the plugin is already installed. **UX/listing only — NOT the idempotency guard.** |
| `prompts` | `Prompt[]` | — | Questions asked before `setup` runs; answers arrive keyed by `id`. |
| `setup` | `(ctx: Ctx, answers: Answers) => void \| Promise<void>` | — (typed form) | The logic. Optional for pure-install plugins (folder form omits `setup.ts`). |

### `name`

Kebab-case, unique, stable — it is the public id. Other plugins reference it in
`dependsOn`/`conflicts`, so renaming is a breaking change. `heroui` and `shadcn`
both `dependsOn: ["tailwind-v4"]`, which is why that plugin is named *exactly*
`tailwind-v4`.

### `displayName`

The label shown in the interactive wizard and in `list_plugins`. Free-form.

### `version`

Semver, conventionally `"1.0.0"`. Informational in v1.

### `appliesTo`

Two optional keys:

- `framework` — matches a detected app framework: `"react"`, `"next"`,
  `"express"`, `"expo"`, `"django"`, `"fastapi"`, …
- `type` — matches an app *kind*: `"new-app"` (scaffolds), `"node-backend"`
  (servers), …

```ts
appliesTo: { framework: "react" }     // heroui, tanstack-query, tailwind-v4
appliesTo: { type: "node-backend" }   // mongodb
appliesTo: { type: "new-app" }        // uv
appliesTo: { framework: "django" }    // django
```

Omit `appliesTo` entirely for a universal plugin (applies anywhere).

### `languages`

Declares which app languages the plugin supports.

- **Omitted ⇒ no restriction** (universal).
- **Present ⇒** compatible only when the target app's `language` is in the list.

Compatibility filtering in the wizard (`manage`) and in MCP
`list_plugins`/`search_plugins` excludes a plugin whose `languages` does not
include the app's language.

```ts
languages: ["ts", "js"]   // heroui, mongodb, tanstack-query
languages: ["python"]     // uv, django
```

### `dependsOn`

Names of other plugins that must be present first. initup offers to add missing
ones, gathering all transitive prompts before a single consolidated Plan + one
consent (SPEC §9). v1 resolves linearly.

```ts
dependsOn: ["tailwind-v4"]   // heroui builds on Tailwind's layers
dependsOn: ["express"]       // mongodb wires into the Express server entry
```

### `conflicts`

Names of plugins that cannot coexist with this one. If a conflicting plugin is
present, resolution **fails loudly** — no automatic negotiation.

```ts
conflicts: ["prisma-sqlite"]   // mongodb
```

### `requires`

Semver ranges for already-installed dependencies. If a range is unmet, resolution
errors.

```ts
requires: { react: ">=19", tailwindcss: ">=4" }   // heroui
```

### `capabilities`

`{ install: boolean; exec: boolean; network: boolean }` — all three are required
keys. This is a *contract*, not a hint. See
[Capabilities & honesty](#capabilities--honesty).

### `detect`

One of `{ dependency: "<pkg>" }` or `{ file: "<path>" }`. Used to show "already
installed" in listings and the wizard. **It is UX only — it is NOT the idempotency
mechanism.** A plugin that crashed mid-run leaves the dependency present but the
project half-patched, and `detect` would wrongly say "done". Safety comes from
per-op idempotency, not `detect` (SPEC §6.1).

```ts
detect: { dependency: "@heroui/react" }   // heroui
detect: { file: "components.json" }        // shadcn
detect: { file: "manage.py" }              // django
```

### `prompts`

See [Prompts](#prompts).

### `setup`

The transformation. Signature: `(ctx: Ctx, answers: Answers) => void | Promise<void>`.
`answers` is keyed by each prompt's `id`. Reads (`ctx.exists`, `ctx.readJson`,
resolvers, `ctx.prompt`) run immediately so you can branch; writes (`ctx.install`,
`ctx.patchConfig`, `ctx.wrap`, …) are recorded and applied transactionally on
commit. Never touch `fs`/`process`/`child_process` directly — every effect goes
through `ctx`.

---

## Prompts

Prompts are declared as facts and asked before `setup()` runs; answers arrive in
`answers` keyed by `id`. A `Prompt` is:

```ts
interface Prompt {
  id: string;                                        // key in `answers`
  type: "confirm" | "text" | "select" | "multiselect";
  message: string;
  default?: unknown;                                 // used under --silent
  choices?: string[];                                // required for select/multiselect
}
```

| `type` | Answer shape | `choices` |
| --- | --- | --- |
| `confirm` | `boolean` | — |
| `text` | `string` | — |
| `select` | `string` (one of `choices`) | required |
| `multiselect` | `string[]` (subset of `choices`) | required |

```ts
prompts: [
  { id: "dbName", type: "text", message: "Database name?", default: "app" },
  {
    id: "components",
    type: "multiselect",
    message: "Which components should be added now?",
    choices: ["button", "input", "card", "dialog"],
    default: [],
  },
]
```

Read answers defensively — they arrive as `unknown`. Coerce and fall back to your
default:

```ts
setup: (ctx, answers) => {
  const dbName =
    typeof answers.dbName === "string" && answers.dbName.trim() !== ""
      ? answers.dbName.trim()
      : "app";
  // ...
};
```

**`--silent` defaults.** Under `--silent` there is no interaction: each prompt
resolves to its `default`. A required prompt with **no default** and no supplied
answer (via `--answers`) is an error. So give every prompt a sensible `default` if
you want the plugin to be usable non-interactively.

**Follow-up prompts.** Because prompting is side-effect-free, you can also ask
conditional/follow-up questions *inside* `setup()` with `await ctx.prompt(...)` —
it returns the prompt's `default` under `--silent`. Use declared `prompts` for the
up-front questions and `ctx.prompt` for ones that depend on discovered state.

---

## Capabilities & honesty

`capabilities` declares what your plugin is *allowed* to do. It is enforced and
surfaced, so it must be **honest**.

| Capability | Set `true` when `setup()`… | Consequence |
| --- | --- | --- |
| `install` | records `ctx.install` / `ctx.installDev`. | Installs are recorded, batched, and reversible. |
| `exec` | calls `ctx.run(cmd)`. | Trips the consent gate (SPEC §8). Exec effects are opaque → the Plan carries only the **command string**, not a diff (a weaker safety guarantee). |
| `network` | reaches the network (e.g. a CLI it runs downloads code). | Trips the consent gate. |

Guiding principle: **computation is free; effects are declared capabilities.** Pure
JS (Math, JSON, strings, loops, `if`) never needs a capability. **File writes are
always recorded and reversible and need no capability flag** — a pure file-writing
plugin can honestly declare every capability `false`:

```ts
// uv: writes files only — no install, no exec, no network.
capabilities: { install: false, exec: false, network: false }
```

```ts
// shadcn: runs the official CLI, which shells out AND downloads over the network.
capabilities: { install: true, exec: true, network: true }
```

Declaring `exec`/`network` you don't use just trips the consent gate needlessly;
declaring them `false` while calling `ctx.run` is dishonest and breaks the safety
model. `ctx.run` requires `capabilities.exec`.

---

## `files/` and `ctx.copy`

Templates you ship with the plugin live in `files/`. `ctx.copy(from, to)` copies a
bundled template into the app.

- `from` is a path inside the plugin (conventionally under `files/`).
- `to` is relative to `ctx.appDir`.

```ts
ctx.copy("files/mongo.ts", "src/config/mongo.ts");
```

At pack time, `files/` is base64-encoded into the artifact's `files` map, so the
template travels inside the single JSON. Use `ctx.copy` for verbatim template
files; use `ctx.addFile(to, content)` when the content is computed/templated in
code (e.g. Django's `settings.py` templated with the chosen project name).

---

## Packing & distribution

An authored plugin (either form) compiles to **one JSON**:

```bash
initup make plugins/heroui/plugin.ts    # typed single file → heroui.json
initup pack ./plugins/heroui            # folder form       → heroui.json
```

The artifact carries:

- the manifest **facts** (`schemaVersion: 1`, `name`, `capabilities`, …),
- `setup` — the bundled `setup()` source as a string (esbuild inlines local
  imports),
- `files` — a `{ "<path>": "<base64>" }` map of your `files/` templates.

Distribute it by hosting the JSON anywhere and sharing a link. A consumer
downloads it and runs `initup add ./that-plugin.json`. It is plain text, so it can
be read/reviewed before running. Third-party plugins needing `exec`/`network` hit
the consent gate on the consumer's machine (see
[using-plugins.md](./using-plugins.md#the-dry-run-plan--consent-gate)).

---

## Best practices

**Idempotency is automatic — per op.** Every write op is independently idempotent:
`ensureLine` skips a line already present, `addToArray` skips a present entry,
`install` skips a satisfied dep, `setEnv` never overwrites a non-empty value,
`wrap` no-ops a tree already wrapped. You do **not** write idempotency checks — but
you must reach for the right op so the guarantee holds (don't hand-concatenate
strings you could `ensureLine`).

**Never hardcode paths — use resolvers.** Locations vary across scaffolds. Instead
of `"src/index.css"` or `"vite.config.ts"`, use `ctx.stylesheet(...)`,
`ctx.configFile("vite")`, `ctx.entryFile()`, `ctx.envFile()`,
`ctx.find`/`ctx.findOrCreate`. They inspect disk and resolve deterministically.

```ts
// Good — resolves the real config, falls back only if none exists:
ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", { /* ... */ });

// Good — finds or creates + wires the global stylesheet:
const css = ctx.stylesheet({ createIfMissing: true });
```

**Order can be load-bearing.** Position-aware inserts matter — Tailwind's
`@import` must precede HeroUI's. Use `{ position: "top" }` / `{ after: "..." }` on
`ensureLine`, not blind append.

**Be honest about capabilities.** Set `exec`/`network` only when you actually call
`ctx.run` / hit the network. (See [above](#capabilities--honesty).)

**Surface manual steps with `ctx.warn`.** When you genuinely can't automate
something (or a codemod target might be non-standard), call `ctx.warn("...")`. It's
collected into `ApplyResult.warnings`, never writes anything, and is safe to call
unconditionally.

```ts
ctx.warn("Run 'python manage.py migrate' then 'python manage.py runserver'.");
```

**Verify with a fixture.** Because the whole point is determinism, test the plugin
against a fixture project: run it, then run it again — the second run should be a
clean no-op (idempotency), and a mid-run failure should roll the fixture back.

**Coerce answers defensively.** `answers` values are `unknown` — narrow the type
and fall back to your `default` (see [Prompts](#prompts)).

---

## Python plugins

Python support is *medium* depth (SPEC §10): a working install / `pyproject` /
entry story, but **no `.py` source AST surgery** (there is no good Node-side Python
AST). Author Python plugins like any other, with these specifics:

- **Declare the language:** `languages: ["python"]`.
- **Installs are manager-aware.** `ctx.install(["django"])` is recorded
  manager-agnostically; at apply time the app's manager is detected and the right
  command runs — `uv add`, `poetry add` / `poetry add --group dev`, or
  `pip install`. So you write `ctx.install`/`ctx.installDev` the same way as for JS.
- **Patch `pyproject.toml` with `ctx.patchToml`** — Python's `patchJson`: a
  format-preserving, idempotent deep-merge (comments/formatting preserved; a
  fully-present merge is a byte-identical no-op). The file is created if missing.

  ```ts
  ctx.patchToml("pyproject.toml", { project: { dependencies: ["httpx"] } });
  ctx.patchToml("pyproject.toml", { tool: { ruff: { "line-length": 100 } } });
  ```

- **`ctx.entryFile()` is Python-aware** — it resolves a Python bootstrap by
  priority (`main.py`, `app.py`, `src/main.py`, `__main__.py`, `manage.py`),
  defaulting to `main.py`.
- **`ctx.configFile("pyproject")`** resolves the real `pyproject.toml` (or `null`).
- **Text-level tools still work:** `ctx.ensureLine`, `ctx.copy`, `ctx.addFile`,
  `ctx.setEnv`, `ctx.findOrCreate`, `ctx.warn`, and `ctx.run` (with
  `capabilities.exec`). Since there's no Python AST, generate `.py` files with
  `ctx.addFile`/`ctx.copy` (templated strings), not codemods — this is exactly how
  the `django` plugin writes `settings.py`/`urls.py`/`wsgi.py`/`asgi.py`.

```ts
// uv — a pure Python file-writer (every capability false):
export default definePlugin({
  name: "uv",
  displayName: "uv (Python package manager)",
  languages: ["python"],
  appliesTo: { type: "new-app" },
  capabilities: { install: false, exec: false, network: false },
  detect: { file: "uv.lock" },
  prompts: [{ id: "python", type: "text", message: "Which Python version?", default: "3.12" }],
  setup: (ctx, answers) => {
    const version = typeof answers.python === "string" && answers.python.trim()
      ? answers.python.trim() : "3.12";
    ctx.findOrCreate(["pyproject.toml"], "pyproject.toml",
      `[project]\nname = "app"\nversion = "0.1.0"\nrequires-python = ">=${version}"\ndependencies = []\n`);
    ctx.addFile(".python-version", `${version}\n`);
    ctx.warn("Run 'uv sync' to create the environment.");
  },
});
```

---

## Full worked example

A from-scratch modifier plugin: add [Zod](https://zod.dev) to a TS/JS app, drop a
shared schema module, and (optionally) seed a `.env` var — showing reads,
branching, resolvers, and several write ops together.

```ts
// plugins/zod-starter/plugin.ts
import { definePlugin } from "@initup/core";

export default definePlugin({
  // ── FACTS ────────────────────────────────────────────────────────────────
  name: "zod-starter",
  displayName: "Zod (schema starter)",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "zod" },
  prompts: [
    {
      id: "seedEnv",
      type: "confirm",
      message: "Seed an APP_ENV variable into .env?",
      default: true,
    },
  ],

  // ── LOGIC ────────────────────────────────────────────────────────────────
  setup: async (ctx, answers) => {
    // 1) Install (recorded; batched; reversible).
    ctx.install(["zod"]);

    // 2) Branch on a READ — only scaffold the module if it isn't there.
    if (!ctx.exists("src/lib/env.ts")) {
      ctx.addFile(
        "src/lib/env.ts",
        `import { z } from "zod";

export const EnvSchema = z.object({
  APP_ENV: z.enum(["development", "production"]).default("development"),
});

export const env = EnvSchema.parse(import.meta.env);
`,
      );
    }

    // 3) Wire the schema into the app entry — resolver, not a hardcoded path.
    const entry = ctx.entryFile();
    ctx.ensureImport(entry, { named: ["env"], from: "./lib/env" });

    // 4) Conditional write driven by the prompt answer. setEnv never clobbers a
    //    developer's existing value; `example: true` seeds .env.example too.
    if (answers.seedEnv === true) {
      ctx.setEnv("APP_ENV", "development", { example: true });
    }

    // 5) Honest manual step — codemod targets can be non-standard.
    ctx.warn("Import { env } where you read environment values.");
  },
});
```

Compile and use it:

```bash
initup make plugins/zod-starter/plugin.ts   # → zod-starter.json
initup add ./zod-starter.json               # or: initup add zod-starter (if in --plugins-dir)
```

---

**See also:** [ctx-reference.md](./ctx-reference.md) — every `ctx` method in
detail · [execution-model.md](./execution-model.md) — the safety model ·
[examples.md](./examples.md) — five real plugins annotated ·
[using-plugins.md](./using-plugins.md) · [`../SPEC.md`](../SPEC.md) §4–§10.
