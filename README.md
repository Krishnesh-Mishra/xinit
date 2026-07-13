# XInit

**The deterministic hands your AI agent uses to touch your project.**

> Version 1.0.0 · MCP-first · [full docs](./docs)

Your coding agent is brilliant at deciding *what* to do and unreliable at *doing
it the same way twice*. Ask it to "add HeroUI" and it searches docs, guesses, and
maybe pastes HeroUI **v2**'s `HeroUIProvider` that **v3 deleted** — and if step 4
fails, you're left with a half-migrated project to untangle by hand.

XInit is the tool the agent calls instead. Adding a technology is **one
deterministic operation** — install the deps **and** patch every config **and**
generate the code — and if *anything* fails, it **rolls the whole thing back** to
exactly where you started.

```
agent: "add mongodb to the api"
  → xinit add_plugin("mongodb")
      install mongoose · write .env · src/config/mongo.ts · wire server.ts
      ✗ npm install failed
      ↩ rolled back — every file restored, nothing left behind
```

**That rollback is the whole point.** It's what makes it safe to let an
autonomous agent modify your codebase: the worst case is a clean no-op, never a
broken tree. Same input → same result, every time.

## Three ways in, one engine

- **AI agents** *(the main event)* — an **MCP server**: `detect_project`,
  `add_plugin`, `doctor`. A risky op (exec/network) returns a dry-run plan plus a
  `confirmToken` the agent must echo back before anything touches disk.
- **You** — `xinit add heroui`, an interactive wizard, or a plan you approve.
- **Scripts / CI** — `--json` / `--silent`, deterministic exit codes.

## Why it isn't "just another scaffolder"

`create-next-app` runs once and walks away; a docs-augmented AI can already learn
the steps. XInit's moat is the part neither gives you — and the part an autonomous
agent actually needs to be trusted:

- **Idempotency** — run it twice, get the same result; no duplicated imports.
- **Transactional rollback** — snapshot → apply → **restore on any failure**.
- **Machine-readable project state** — `detect --json` instead of reading 50 files.

It's proven end-to-end: the test suite adds HeroUI to a real project, asserts the
exact CSS import order, re-runs it as a no-op, and forces a failure to confirm
every byte is restored.

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

## It already speaks 31 stacks

Breadth here is *evidence the engine generalizes* — not the reason to use it. The
point isn't the count; it's that **every** one installs, patches, and rolls back
the exact same deterministic way.

| Group | Plugins |
| --- | --- |
| Frameworks | `react` · `nextjs` · `vue` · `sveltekit` · `react-native-expo` |
| Backend | `express` · `nestjs` · `fastify` · `hono` · `bun` |
| Realtime | `ws` · `socketio` |
| UI / styling | `tailwind-v4` · `shadcn` · `heroui` · `heroui-native` · `uniwind` · `mui` · `chakra` |
| State / data | `zustand` · `tanstack-query` · `mongodb` · `prisma` · `drizzle` · `redis` |
| Infra | `docker` |
| Python | `uv` · `python-dotenv` · `ruff` · `fastapi` · `django` |

Adding one is a ~20-line typed file — see the [authoring guide](./docs/authoring-plugins.md).

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
