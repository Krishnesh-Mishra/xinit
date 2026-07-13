# docker

Adds Docker support to a Node project — a **pure file plugin** (no npm install,
no exec, no network).

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup pack plugins/docker`.

- **Applies to:** `ts` / `js` projects (applies broadly — no framework restriction).

## Prompts

| id        | type    | default  | effect                                              |
| --------- | ------- | -------- | --------------------------------------------------- |
| `port`    | text    | `"3000"` | `EXPOSE`d in the Dockerfile and mapped in compose.  |
| `compose` | confirm | `false`  | Also generate a `docker-compose.yml`.               |

## What it creates

- **`Dockerfile`** — `node:20-alpine`, installs deps, `EXPOSE <port>`, `npm start`.
- **`.dockerignore`** — excludes `node_modules`, `.env`, build output, etc.
- **`docker-compose.yml`** (only when `compose` is `true`) — a single `app`
  service building the Dockerfile with `"<port>:<port>"` published.

Capabilities: none — `{ install: false, exec: false, network: false }`.
