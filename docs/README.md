# XInit documentation

Reference material for **using** XInit and **authoring** plugins — for people and
for AI agents. Everything here is grounded in the frozen v1 contract
([`../SPEC.md`](../SPEC.md)) and the source types (`packages/core/src/types.ts`).

## Quickstart (3 steps)

1. **Build** — `pnpm install && pnpm build` at the repo root.
2. **Add a plugin** — `xinit add heroui` (or `xinit add ./my-plugin.json`). See
   [using-plugins.md](./using-plugins.md).
3. **Author your own** — write `plugins/<name>/plugin.ts`, then
   `xinit make plugins/<name>/plugin.ts`. See
   [authoring-plugins.md](./authoring-plugins.md).

## Guides

| Doc | What it covers |
| --- | --- |
| [using-plugins.md](./using-plugins.md) | Full user guide: every CLI command and flag, adding first-party vs third-party plugins, trust tiers, the dry-run plan + consent gate, `--json`/`--silent` for scripts and AI, monorepo `--app`, and driving XInit from the MCP server (the 6 tools + confirm-token handshake). |
| [authoring-plugins.md](./authoring-plugins.md) | The main authoring guide: the "JSON = facts, code = logic" model, typed single-file vs folder forms, every manifest/`PluginDefinition` field, prompts, capabilities & honesty, `files/` + `ctx.copy`, packing & distribution, best practices, a Python subsection, and a full worked example. |
| [ctx-reference.md](./ctx-reference.md) | The complete `ctx` API: every read, resolver, and write with its exact signature, an example, and its idempotency/CRLF/no-overwrite notes — plus the supporting types (`WrapSpec`, `ConfigEdit`, `EnsureImportSpec`, `SetEnvOpts`, `Prompt`). |
| [execution-model.md](./execution-model.md) | How XInit stays safe: reads-immediate/writes-deferred, the Plan, the consent gate + MCP confirm-token handshake, transaction/rollback, per-op idempotency, and the sandbox + capabilities model. |
| [examples.md](./examples.md) | Five annotated walkthroughs of real plugins — `heroui`, `shadcn`, `mongodb`, `tanstack-query`, `django` — explaining every `ctx` call. |

## Related

- [`../README.md`](../README.md) — project overview and the plugin catalog.
- [`../SPEC.md`](../SPEC.md) — the frozen v1 contract (architecture, execution
  model, sandbox, consent, resolver, Python).
- [`../FUTURE.md`](../FUTURE.md) — deliberately deferred ideas (remove/update,
  signed registry, WASM isolate hardening, deep Python source rewriting).
