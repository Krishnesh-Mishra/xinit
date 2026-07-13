# express

Adds an Express + TypeScript backend, run with `tsx`. Applies to `node-backend`
projects.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/express/plugin.ts`.

## Prompts

| id     | type | default  | effect                                   |
| ------ | ---- | -------- | ---------------------------------------- |
| `port` | text | `"3000"` | Fallback port baked into `src/server.ts` (still overridable at runtime via `process.env.PORT`). |

## What it installs / patches

- **Installs:** `express`. **Dev:** `@types/express`, `tsx`, `typescript`.
- **Files:** `src/server.ts` (generated with the chosen port interpolated in),
  `tsconfig.json`.
- **Scripts:** `dev` → `tsx watch src/server.ts`, `start` → `node --import tsx src/server.ts`.

Capabilities: `install` only — no exec, no network.
