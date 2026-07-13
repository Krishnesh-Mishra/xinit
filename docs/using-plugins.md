# Using XInit

How to drive XInit as a human at the CLI, as a script/CI job, and as an AI agent
through the MCP server. Every command, flag, and tool name below matches the
source (`packages/cli/src/cli.ts`, `packages/mcp/src/index.ts`).

- [Install & build](#install--build)
- [The mental model](#the-mental-model)
- [CLI commands](#cli-commands)
  - [`xinit` / `xinit detect`](#xinit--xinit-detect)
  - [`xinit add`](#xinit-add)
  - [`xinit manage`](#xinit-manage)
  - [`xinit create`](#xinit-create)
  - [`xinit doctor`](#xinit-doctor)
  - [`xinit pack`](#xinit-pack)
  - [`xinit make`](#xinit-make)
- [First-party vs third-party plugins (trust tiers)](#first-party-vs-third-party-plugins-trust-tiers)
- [The dry-run plan + consent gate](#the-dry-run-plan--consent-gate)
- [Scripts & AI: `--json` and `--silent`](#scripts--ai---json-and---silent)
- [Monorepos: `--app`](#monorepos---app)
- [Using XInit via MCP](#using-xinit-via-mcp)

---

## Install & build

XInit is a pnpm monorepo. Build once, then run the `xinit` CLI.

```bash
pnpm install
pnpm build        # builds @xinit/core, xinit (CLI), @xinit/mcp
```

The CLI binary is `xinit` (package `xinit`). The MCP server is a Node entry at
`packages/mcp/dist/index.js`.

## The mental model

A **plugin** is one idempotent, reversible transformation that does the *whole*
job of adding a technology: install the deps **and** patch the config **and**
generate the starter code. Adding one is always:

1. **Detect** — XInit fingerprints the project (kind, package manager, apps).
2. **Resolve** — dependencies (`dependsOn`), conflicts, and version `requires`
   are checked; prompts are gathered.
3. **Plan** — `setup()` runs against real project state and records writes into a
   **Plan** (a dry run — nothing has touched disk yet).
4. **Consent** — the Plan is shown; you approve (or it runs immediately for
   trusted, effect-free plugins).
5. **Apply** — writes are committed inside a transaction; any failure rolls the
   project back to its pre-run state.

See [execution-model.md](./execution-model.md) for the full picture.

---

## CLI commands

Global convention: `--json` makes **stdout pure JSON** (errors are emitted as
`{"status":"error","message":"..."}` so stdout stays valid JSON); without it,
human output goes to stderr/stdout with colour. A cancelled interactive prompt
exits `130`; a rolled-back apply exits `1`.

### `xinit` / `xinit detect`

Fingerprint the project in the current working directory and print its `Project`
model.

```bash
xinit                # detect (default command)
xinit detect         # same, explicit
xinit detect --json  # machine-readable Project model
```

| Flag | Meaning |
| --- | --- |
| `--json` | Output the `Project` model as JSON. |

The `Project` model contains `root`, `kind` (`single` | `monorepo`), `manager`
(`pnpm` \| `npm` \| `yarn` \| `bun` \| `uv` \| `poetry` \| `pip` \| …),
`confidence` (0..1), `apps[]`, and `packages[]`. Each app carries `name`, `path`,
`language` (`js` \| `ts` \| `python`), optional `framework`, and `plugins[]`
(names detected as already installed — **UX only**, not a guarantee).

### `xinit add`

Add/configure a plugin in an app. This is the core verb.

```bash
xinit add <plugin> [--app <name>] [--plugins-dir <dir>] \
                   [--answers <json>] [--json] [--silent] [--yes]
```

| Flag | Meaning |
| --- | --- |
| `--app <name>` | Target app in a monorepo. Defaults to the single app, else prompts. |
| `--plugins-dir <dir>` | Directory of available plugins to resolve `<plugin>` from. |
| `--answers <json>` | Preset prompt answers as a JSON object, e.g. `--answers '{"dbName":"shop"}'`. |
| `--json` | Machine-readable output (stdout is JSON only). |
| `--silent` | No prompts; use prompt defaults (requires all answers to be available). |
| `--yes` | Auto-approve the consent handshake. |

`<plugin>` is either a **first-party name** (`heroui`, `mongodb`, …), a **local
path** to an authored plugin folder or `plugin.ts`, or a **packed JSON** file
(e.g. one you pasted from a link). See
[trust tiers](#first-party-vs-third-party-plugins-trust-tiers).

```bash
xinit add heroui                          # first-party by name
xinit add mongodb --answers '{"dbName":"shop"}'
xinit add ./plugins/heroui                # local folder
xinit add ./downloads/cool-plugin.json    # packed single-JSON
xinit add shadcn --yes                     # approve the exec/network consent gate
```

### `xinit manage`

Launch the interactive wizard: repo → (Manage Apps | Manage Packages) → app →
(Add plugin | Configure plugin) → prompts → Plan → confirm → apply. v1 adds and
configures; it does **not** remove.

```bash
xinit manage [--plugins-dir <dir>]
```

| Flag | Meaning |
| --- | --- |
| `--plugins-dir <dir>` | Directory of available plugins. |

### `xinit create`

Scaffold a new app. v1 ships the `react` template.

```bash
xinit create [template] [--dir <path>] [--plugins-dir <dir>] \
                        [--json] [--silent] [--yes]
```

| Flag | Meaning |
| --- | --- |
| `--dir <path>` | Target directory (default: cwd). |
| `--plugins-dir <dir>` | Directory of available plugins. |
| `--json` | Machine-readable output (stdout is JSON only). |
| `--silent` | No prompts; use defaults. |
| `--yes` | Auto-approve the consent handshake. |

```bash
xinit create react --dir ./my-app
```

### `xinit doctor`

Report project health. **v1 reports only — it does not fix.**

```bash
xinit doctor [--json]
```

| Flag | Meaning |
| --- | --- |
| `--json` | Output the health report as JSON. |

### `xinit pack`

Pack an authored plugin **folder** (`plugin.json` + optional `setup.ts` + `files/`)
into a single distributable JSON. `setup.ts` is bundled with esbuild (local
imports inlined) into a `setup` string, and `files/` are base64-encoded into a
`files` map.

```bash
xinit pack <dir> [--out <file>] [--json]
```

| Flag | Meaning |
| --- | --- |
| `--out <file>` | Output file (default: `<name>.json`). |
| `--json` | Machine-readable output (stdout is JSON only). |

```bash
xinit pack ./plugins/mongodb --out mongodb.json
```

### `xinit make`

Compile a **typed** `plugin.ts` (the recommended single-file form) — or a folder —
into the same single distributable JSON. This is the everyday authoring command.

```bash
xinit make <entry> [--out <file>] [--json]
```

| Flag | Meaning |
| --- | --- |
| `--out <file>` | Output file (default: `<name>.json`). |
| `--json` | Machine-readable output (stdout is JSON only). |

```bash
xinit make plugins/tailwind-v4/plugin.ts   # → tailwind-v4.json
```

> `pack` and `make` produce the **same** artifact — a JSON carrying the manifest
> facts, a bundled `setup` string, and base64 `files`. `make` starts from a typed
> single file; `pack` starts from a `plugin.json` + `setup.ts` folder. Author with
> whichever you prefer; see [authoring-plugins.md](./authoring-plugins.md).

---

## First-party vs third-party plugins (trust tiers)

XInit is **open**: anyone may author a plugin and paste a link to its JSON. Trust
is expressed by *where the plugin comes from* and *what capabilities it declares*,
not by a gatekeeper.

| Tier | How you add it | Behavior |
| --- | --- | --- |
| **First-party** (bundled by name) | `xinit add heroui` | Curated and shipped with XInit. Runs immediately. |
| **Third-party, install-only** (no `exec`/`network`) | `xinit add ./plugin.json` or a local folder | Only installs deps and patches files — every write is recorded and reversible. Runs, flagged as third-party. |
| **Third-party needing `exec` or `network`** | `xinit add ./plugin.json` | Trips the **consent gate**: you review the Plan first. Approve with `--yes` (CLI) or the confirm-token (MCP). |

Because pasted code runs in a sandbox where *computation is free but every effect
is a declared, consented capability*, "open" does not mean "unrestricted" — see
[execution-model.md](./execution-model.md#sandbox--capabilities).

Adding from a **local path** (`./my-plugin/` or `./my-plugin/plugin.ts`) or a
**packed JSON** (`./my-plugin.json`) is how you consume third-party plugins today.
Download the JSON, read it if you like (it is plain text — manifest facts + a
`setup` string + base64 files), then `xinit add ./my-plugin.json`.

## The dry-run plan + consent gate

Running a plugin's `setup()` never touches disk directly — it produces a **Plan**:
the exact list of installs, file writes (with diffs), and exec commands that
*would* run, plus the declared `capabilities` and any manual-step `warnings`.

- In the **interactive** CLI you see the Plan and confirm before it applies.
- Effect-free trusted plugins (first-party, or third-party install-only) apply
  without an extra gate.
- Plugins declaring `exec`/`network` require explicit approval: `--yes` on the CLI,
  or the confirm-token handshake over MCP.

A `Plan` includes `requiresConfirmation` and — for the MCP handshake — a
`confirmToken` that is a hash of the exact computed Plan, so an approval can't be
replayed against a different action.

## Scripts & AI: `--json` and `--silent`

For non-interactive callers (CI, scripts, agents):

- `--json` — stdout is **pure JSON only**. On success you get the `ApplyResult`
  (`status`, `installed`, `created`, `modified`, `commands`, `warnings`, and — when
  gated — `confirmToken` + `plan`); on error you get
  `{"status":"error","message":"..."}`. Never mix human text into stdout.
- `--silent` — no interactive prompts; prompt **defaults** are used. Provide any
  answers a prompt lacks a default for via `--answers '<json>'`; a required prompt
  with no default and no supplied answer is an error.
- `--yes` — auto-approve the consent gate (pair with `--silent`/`--json` for full
  non-interactive runs).

```bash
# Fully non-interactive, machine-readable, auto-approved:
xinit add mongodb --app api --answers '{"dbName":"shop"}' --json --silent --yes
```

`ApplyResult.status` is one of `success`, `rolled_back`, or
`confirmation_required`. A `rolled_back` apply exits `1`.

## Monorepos: `--app`

In a monorepo, target one app with `--app <name>` (the app `name` from
`xinit detect`). Without it, XInit uses the single app if there is exactly one,
otherwise it prompts (or errors under `--silent`). `ctx.appDir` inside the plugin
points at that app; `ctx.repoRoot` is the monorepo root.

```bash
xinit detect --json                 # find app names
xinit add tailwind-v4 --app web
```

---

## Using XInit via MCP

The MCP server (`@xinit/mcp`) exposes the same core to AI agents (Claude Code,
Codex, Cursor). Register it:

```bash
claude mcp add xinit -- node /path/to/xinit/packages/mcp/dist/index.js
```

It is a stdio server named `xinit`. Every tool returns structured JSON in the MCP
`content` result; all determinism/idempotency/consent logic lives in core.

### The 6 tools

| Tool | Input | What it does |
| --- | --- | --- |
| `detect_project` | `{ root?: string }` | Fingerprint a directory (defaults to cwd) and return the `Project` model (kind, manager, apps, packages, detected plugins). |
| `list_plugins` | `{ language?: string }` | List the bundled reference plugins (name, displayName, appliesTo, languages, capabilities). Pass `language` (`js`\|`ts`\|`python`) to exclude language-incompatible plugins. |
| `search_plugins` | `{ query: string, language?: string }` | Filter bundled plugins by name/display name; `language` also excludes incompatible ones. |
| `add_plugin` | `{ plugin: string, app?: string, answers?: object, confirm?: string }` | Add a plugin to an app. `plugin` is a bundled name (first-party) or a path to an authored plugin folder (third-party). See the handshake below. |
| `doctor` | `{ root?: string }` | Detect the project and return a structured health report (apps, detected plugins, warnings). Modifies nothing. |
| `get_graph` | `{ root?: string }` | Return a dependency-graph view: nodes for the repo, apps/packages, frameworks and plugins, with edges between them. |

> Note: `get_graph` is an MCP tool only — there is no `xinit graph` CLI command in
> v1.

### The confirm-token handshake (from the user's / agent's side)

No interactive prompt exists for an agent, so consent becomes a **required second
call**:

- **First-party** or **third-party install-only** plugins run immediately.
  `add_plugin` returns the `ApplyResult` with `status: "success"`.
- A **third-party plugin needing `exec` or `network`** does **not** run. It returns:

  ```json
  {
    "status": "confirmation_required",
    "plan": { "...": "the full dry-run Plan" },
    "confirmToken": "<hash of this exact Plan>"
  }
  ```

  The agent (or the user reviewing on its behalf) inspects `plan`, then re-calls
  the **same** tool with the same args plus `confirm: "<confirmToken>"` to proceed:

  ```jsonc
  // 1st call — returns confirmation_required + confirmToken
  add_plugin({ "plugin": "./shadcn.json", "app": "web" })
  // 2nd call — proceeds
  add_plugin({ "plugin": "./shadcn.json", "app": "web", "confirm": "<confirmToken>" })
  ```

Because `confirmToken` is a hash of the exact computed Plan, a confirmation cannot
be replayed against a different action — if the Plan changes, the old token is
invalid. Together with the sandbox this is the full defense when no human is in the
loop.

---

**See also:** [authoring-plugins.md](./authoring-plugins.md) ·
[ctx-reference.md](./ctx-reference.md) ·
[execution-model.md](./execution-model.md) · [examples.md](./examples.md) ·
[`../SPEC.md`](../SPEC.md).
