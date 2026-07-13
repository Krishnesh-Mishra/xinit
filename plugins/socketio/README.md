# socketio

Adds a [Socket.IO](https://socket.io) server (with an optional browser client)
to a Node backend.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup pack plugins/socketio`.

- **Applies to:** `node-backend` apps (`ts` / `js`).
- Add-to-existing modifier; works with any HTTP framework.

## Prompts

| id       | type    | default | effect                                                |
| -------- | ------- | ------- | ----------------------------------------------------- |
| `client` | confirm | `false` | Also install `socket.io-client` + a client example.   |

## What it installs / patches

- **Installs:** `socket.io` (and `socket.io-client` when `client` is `true`).
- **Files:** `src/socket.ts` — a standalone Socket.IO server on `SOCKET_PORT`
  (default `3001`). When `client` is `true`, also `src/socket-client.ts`.
- **Entry:** ensures a side-effect `import "./socket";` in the backend entry
  (`src/server.ts`, else `src/index.ts`; created if neither exists).

## Manual step

The generated server runs on its own port. To attach to an existing HTTP server,
pass it to `new Server(httpServer, { cors })` (a warning is surfaced on apply).

Capabilities: `install` only — no exec, no network.
