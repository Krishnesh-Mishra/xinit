# redis

Adds a Redis client to a backend — **cross-language**. The plugin branches on the
app's language (`ctx.language()`) and installs the idiomatic client for each stack.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup pack plugins/redis`.

- **Applies to:** any backend, `ts` / `js` / `python`.
- Add-to-existing modifier; works with any HTTP framework.

## Why ioredis (JS/TS)

`ioredis` accepts a `redis://` URL directly (`new Redis(process.env.REDIS_URL)`)
and ships robust reconnection, Cluster and Sentinel support — the reason it is
preferred over the base `redis` client for the Node path.

## Prompts

| id    | type | default                     | effect                                     |
| ----- | ---- | --------------------------- | ------------------------------------------ |
| `url` | text | `"redis://localhost:6379"`  | Value written to `REDIS_URL` in `.env`.    |

## What it installs / patches

| Language  | Installs   | File                   | Client                                    |
| --------- | ---------- | ---------------------- | ----------------------------------------- |
| `ts`/`js` | `ioredis`  | `src/config/redis.ts`  | shared client; side-effect import wired into the entry |
| `python`  | `redis`    | `redis_client.py`      | `redis.from_url(REDIS_URL)`               |

`ctx.install` dispatches through the app's detected package manager — `uv add`
for a Python/uv app, `pnpm add`/`npm install`/… for a JS app — so the plugin only
picks package **names** per language, never the manager.

- **JS/TS entry:** ensures a side-effect `import "./config/redis";` in the backend
  entry (`src/server.ts`, else `src/index.ts`; created if neither exists) so the
  client connects on boot.
- **`.env`:** ensures `REDIS_URL=<url>` (seeded into `.env.example` too).

Capabilities: `install` only — no exec, no network.
