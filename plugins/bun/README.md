# bun

Adds a [Bun](https://bun.sh) runtime backend built on the native `Bun.serve`
API — zero dependencies. Applies to `node-backend` projects.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit pack plugins/bun`.

## Prompts

| id     | type | default  | effect                                                    |
| ------ | ---- | -------- | --------------------------------------------------------- |
| `port` | text | `"3000"` | Fallback port baked into the server (overridable at runtime via `process.env.PORT`). |

## What it does

- **Files:** `src/index.ts` (a `Bun.serve` app, or reuses `src/server.ts` if it
  exists) and a `tsconfig.json` — created only when the project has none.
- **Scripts:** `dev` → `bun --watch src/index.ts`, `start` → `bun src/index.ts`.
- **Manual step:** warns to run `bun install`.

Capabilities: none (`install`, `exec`, `network` all false). `Bun.serve` is
built in, so the plugin installs nothing and runs nothing — Bun itself may not
be installed on the machine, so setup is fully deterministic and side-effect-free
apart from the recorded file writes.
