# ws

Adds WebSocket support (via the [`ws`](https://github.com/websockets/ws) library)
to a Node backend.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup pack plugins/ws`.

- **Applies to:** `node-backend` apps (`ts` / `js`).
- Add-to-existing modifier; works with any HTTP framework.

## Prompts

None — install-only, no configuration.

## What it installs / patches

- **Installs:** `ws`. **Dev:** `@types/ws`.
- **Files:** `src/ws-server.ts` — a standalone `WebSocketServer` on `WS_PORT`
  (default `8080`) that echoes messages.
- **Entry:** ensures a side-effect `import "./ws-server";` in the backend entry
  (`src/server.ts`, else `src/index.ts`; created if neither exists).

## Manual step

The generated server runs on its own port so it composes with any framework. To
share an existing HTTP server, construct it with `new WebSocketServer({ server })`
instead of `{ port }` (a warning is surfaced on apply).

Capabilities: `install` only — no exec, no network.
