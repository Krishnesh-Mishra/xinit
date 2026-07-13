# redis

Adds a Redis client (via [`ioredis`](https://github.com/redis/ioredis)) to a
Node backend.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup pack plugins/redis`.

- **Applies to:** `node-backend` apps (`ts` / `js`).
- Add-to-existing modifier; works with any HTTP framework.

## Why ioredis

`ioredis` accepts a `redis://` URL directly (`new Redis(process.env.REDIS_URL)`)
and ships robust reconnection, Cluster and Sentinel support — the reason it is
preferred over the base `redis` client for this plugin.

## Prompts

| id    | type | default                     | effect                                     |
| ----- | ---- | --------------------------- | ------------------------------------------ |
| `url` | text | `"redis://localhost:6379"`  | Value written to `REDIS_URL` in `.env`.    |

## What it installs / patches

- **Installs:** `ioredis`.
- **Files:** `src/config/redis.ts` — a shared client (default + named export).
- **`.env`:** ensures `REDIS_URL=<url>`.
- **Entry:** ensures a side-effect `import "./config/redis";` in the backend
  entry (`src/server.ts`, else `src/index.ts`; created if neither exists) so the
  client connects on boot.

Capabilities: `install` only — no exec, no network.
