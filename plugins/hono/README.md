# hono

Adds a [Hono](https://hono.dev) backend wired for your chosen JavaScript
runtime. Applies to `node-backend` projects. Fully deterministic and
install-only.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup pack plugins/hono`.

## Prompts

| id        | type   | default  | effect                                          |
| --------- | ------ | -------- | ----------------------------------------------- |
| `runtime` | select | `"node"` | Selects the server adapter: `node`, `bun`, or `cloudflare`. |
| `port`    | text   | `"3000"` | Fallback listening port baked into the server / wrangler config. |

## What it installs / patches (by runtime)

- **node** — installs `hono` + `@hono/node-server`; dev `tsx`, `typescript`,
  `@types/node`. Writes `src/index.ts` using `serve()`. Scripts: `dev` →
  `tsx watch src/index.ts`, `start` → `node --import tsx src/index.ts`.
- **bun** — installs `hono`; dev `@types/bun`. Writes `src/index.ts` exporting
  `{ port, fetch }`. Scripts: `dev` → `bun run --hot src/index.ts`, `start` →
  `bun run src/index.ts`. Warns to run `bun install`.
- **cloudflare** — installs `hono`; dev `wrangler`, `@cloudflare/workers-types`.
  Writes `src/index.ts` (`export default app`) and a `wrangler.jsonc`. Scripts:
  `dev` → `wrangler dev`, `deploy` → `wrangler deploy`.

Capabilities: `install` only — no exec, no network.
