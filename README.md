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

Early development. v1 scope is intentionally small and honest:

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
  react · express · mongodb · heroui · shadcn                 (reference plugins)
```

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

## License

MIT © Krishnesh Mishra
