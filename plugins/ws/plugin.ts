import { definePlugin } from "@initup/core";

/**
 * WebSocket support via the `ws` library for a Node backend.
 *
 * Add-to-existing modifier: installs `ws` (+ `@types/ws`), drops a
 * `src/ws-server.ts` standalone WebSocket server, and wires a side-effect
 * import into the backend entry (`src/server.ts`, else `src/index.ts`). The
 * server runs on its own port so it composes with any HTTP framework; a
 * manual-step warning explains how to share an existing HTTP server instead.
 *
 * install-only — no exec, no network.
 */
export default definePlugin({
  name: "ws",
  displayName: "WebSocket (ws)",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "ws" },
  setup: async (ctx) => {
    ctx.install(["ws"]);
    ctx.installDev(["@types/ws"]);

    ctx.copy("files/ws-server.ts", "src/ws-server.ts");

    // Wire a side-effect import into the backend entry (create it if absent).
    const entry = ctx.findOrCreate(
      ["src/server.ts", "src/index.ts"],
      "src/server.ts",
    );
    ctx.ensureImport(entry, { import: "./ws-server" });

    ctx.warn(
      "ws: src/ws-server.ts starts a standalone WebSocket server on WS_PORT " +
        "(default 8080). To share your existing HTTP server, construct it with " +
        "`new WebSocketServer({ server })` instead of `{ port }`.",
    );
  },
});
