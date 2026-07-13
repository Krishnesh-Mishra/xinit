# fastify

Adds a [Fastify](https://fastify.dev) + TypeScript backend, run with `tsx`.
Applies to `node-backend` projects. Fully deterministic and install-only.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit pack plugins/fastify`.

## Prompts

| id     | type | default  | effect                                                    |
| ------ | ---- | -------- | --------------------------------------------------------- |
| `port` | text | `"3000"` | Fallback port baked into the server (overridable at runtime via `process.env.PORT`). |

## What it installs / patches

- **Installs:** `fastify`. **Dev:** `tsx`, `typescript`, `@types/node`.
- **Files:** `src/server.ts` (or reuses `src/index.ts` if it already exists),
  generated with the chosen port interpolated in.
- **Scripts:** `dev` → `tsx watch <entry>`, `start` → `node --import tsx <entry>`.

Capabilities: `install` only — no exec, no network.
