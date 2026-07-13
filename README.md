# XInit

**A deterministic, AI-native project operations engine.**

> Version 1.0.0

XInit is not "another project generator." It's an engine that **understands an
existing project and safely evolves it** — installing dependencies, patching
config files, and generating code to correctly integrate a technology, as one
idempotent, reversible operation. The same core is driven three ways:

- **Humans** — an interactive wizard (`xinit`)
- **Scripts / CI** — deterministic commands with `--json` / `--silent`
- **AI agents** — an MCP server that Claude Code, Codex, Cursor, etc. can call

The unit of work is a **plugin**: a scripted, idempotent transformation that
does the whole job of adding a technology — *install the deps **and** patch the
config **and** generate the starter code.*

```
shadcn  = write components.json + patch CSS + add @/* alias + run the CLI
mongodb = install mongoose + write .env + src/config/mongo.ts + wire it into server.ts
heroui  = install @heroui/* + add the tailwind vite plugin + fix CSS import order
```

## Why it exists (in an AI-agent world)

An AI agent adding HeroUI today searches docs, guesses, and *maybe* forgets a
config line — it's non-deterministic, and its knowledge can be stale (it might
paste HeroUI **v2**'s `HeroUIProvider`, which **v3 removed**). XInit's moat is
**not** "it knows the steps" — a docs-augmented AI can learn those. The moat is
what an AI *still* can't guarantee on its own:

- **Determinism & idempotency** — run it twice, get the same result; no duplicates.
- **Transactional safety** — snapshot → apply → **roll back** on any failure.
- **Machine-readable project state** — `xinit detect --json` instead of reading 50 files.

So XInit is designed to be **the tool the agent calls**, not a competitor to it.

## Status

**v1 implemented** — engine + CLI + MCP server + typed authoring SDK + **31 first-party plugins** (JS/TS **and** Python), 176 tests green. Scope is intentionally small and honest:

| Area | v1 | Later |
| --- | --- | --- |
| Verbs | `create`, `detect`, `add`, `manage`, `doctor` | `remove`, `update` (migrations) |
| Languages | JavaScript/TypeScript (deep), Python (medium) | C++ |
| Interfaces | CLI (wizard + `--json`/`--silent`), MCP server | REST API |
| Plugins | curated first-party + open "paste a link" (sandboxed) | signed registry |

See [`SPEC.md`](./SPEC.md) for the frozen v1 architecture and
[`FUTURE.md`](./FUTURE.md) for deliberately deferred ideas.

## Architecture (one core, many front-ends)

```
                 xinit-core  (no printing, no prompts — pure API + events)
                /     |      \
             CLI     MCP    (REST later)
              |       |         |
           Humans  AI agents  CI/CD
```

```
packages/
  core/        detect · patch · tx · plugin runtime · plan   (the engine)
  cli/         wizard + --json/--silent                       (a thin skin)
  mcp/         MCP tools + consent handshake                  (a thin skin)
  plugin-sdk/  types + helpers for plugin authors
plugins/
  31 first-party plugins (JS + Python: frameworks, backends, UI, data, mobile, infra)
```

## First-party plugins (v1)

| Group | Plugins |
| --- | --- |
| Frameworks | `react` · `nextjs` · `vue` · `sveltekit` · `react-native-expo` |
| Backend | `express` · `nestjs` · `fastify` · `hono` · `bun` |
| Realtime | `ws` · `socketio` |
| UI / styling | `tailwind-v4` · `shadcn` · `heroui` · `heroui-native` · `uniwind` · `mui` · `chakra` |
| State / data | `zustand` · `tanstack-query` · `mongodb` · `prisma` · `drizzle` · `redis` |
| Infra | `docker` |
| Python | `uv` · `python-dotenv` · `ruff` · `fastapi` · `django` |

Each is a typed, single-file plugin — install + config-patch + codegen as one
idempotent, reversible operation. More are easy to add (see below).

## Using plugins

Build the workspace once (`pnpm install && pnpm build`), then add any plugin to
the app in the current directory:

```bash
xinit add heroui                 # a first-party plugin by name
xinit add ./plugins/mongodb      # a local authored folder or plugin.ts
xinit add ./heroui.json          # a packed single-JSON (e.g. pasted from a link)
xinit add heroui --app web       # target one app in a monorepo
```

**Trust tiers.** First-party plugins (bundled by name) run immediately. A
third-party plugin (local path or pasted link) that only installs/patches files
also runs, but any plugin that needs `exec` or `network` hits a **consent gate**:
XInit computes the dry-run **Plan** and asks you to approve it before anything
touches disk. Approve non-interactively with `--yes`.

```bash
xinit add shadcn --yes           # auto-approve the consent gate
xinit add heroui --json          # stdout is pure JSON (for scripts/agents)
xinit add heroui --silent        # no prompts; use prompt defaults
```

**Via MCP** — point Claude Code / Codex / Cursor at the server and the agent
gets the same engine (`detect_project`, `add_plugin`, …); a plugin needing
exec/network returns a `confirmToken` the agent echoes back to proceed.

→ Full guide: [`docs/using-plugins.md`](./docs/using-plugins.md).

## Plugins in one minute

A plugin is a **folder** you author, packed into a **single JSON** you can host
and paste a link to:

```
react/
  plugin.json    facts only — name, prompts, capabilities (never grows complex)
  setup.ts       logic — plain code with plain `if` (no JSON DSL, no permutations)
  files/         templates to copy
```

`xinit pack ./react` bundles it into `react.json` (code inlined as a string,
templates inlined too). The rule that keeps it sane:

> **JSON holds facts. Code holds logic.**

Inside `setup.ts` you get a small, safe `ctx` toolbox (`copy`, `install`,
`ensureLine`, `patchConfig`, …). Every effect is **recorded** so XInit can show a
dry-run plan and roll back. Pure computation is free; every real-world effect
(files, installs, exec, network) is a **declared capability**, shown in the plan,
and gated by consent.

## Writing a plugin (basics)

The recommended form is a single typed file, `plugins/<name>/plugin.ts`, that
default-exports `definePlugin({ ...facts, setup })`:

```ts
import { definePlugin } from "@xinit/core"; // "xinit" also works

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

Compile it into a distributable single JSON:

```bash
xinit make plugins/tailwind-v4/plugin.ts   # → tailwind-v4.json
```

→ Full guide: [`docs/authoring-plugins.md`](./docs/authoring-plugins.md), with the
complete [`ctx` reference](./docs/ctx-reference.md).

## Usage

```bash
pnpm install
pnpm build
```

**CLI**

```bash
xinit detect [--json]          # fingerprint the project
xinit add heroui [--app web]   # install + patch + generate, transactionally
xinit manage                   # interactive: app → plugin
xinit create                   # scaffold a new React app
xinit doctor [--json]          # report project health (v1: report-only)
xinit pack ./plugins/heroui    # author folder → single distributable JSON
```

`--json` keeps stdout pure JSON (for scripts/agents), `--silent` skips prompts
(uses defaults), `--yes` auto-approves the consent gate.

**MCP server** (for Claude Code / Codex / Cursor)

```bash
claude mcp add xinit -- node /path/to/xinit/packages/mcp/dist/index.js
```

Tools: `detect_project`, `list_plugins`, `search_plugins`, `add_plugin`,
`doctor`, `get_graph`. A third-party plugin needing exec/network returns
`confirmation_required` with a `confirmToken` the agent echoes back to proceed.

## Develop

```bash
pnpm install
pnpm build       # all packages
pnpm test        # 176 tests across core / cli / mcp
pnpm typecheck
```

Monorepo: `@xinit/core` (engine) · `xinit` (CLI) · `@xinit/mcp` (server) ·
`plugins/*` (reference plugins). See [`SPEC.md`](./SPEC.md) for the frozen
architecture.

## License

MIT © Krishnesh Mishra
