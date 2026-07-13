import { definePlugin } from "@xinit/core";

/**
 * Socket.IO server for a Node backend, with an optional browser client.
 *
 * Add-to-existing modifier: installs `socket.io`, drops a `src/socket.ts`
 * standalone Socket.IO server, and wires a side-effect import into the backend
 * entry. The `client` prompt additionally installs `socket.io-client` and drops
 * a `src/socket-client.ts` example.
 *
 * install-only — no exec, no network.
 */
export default definePlugin({
  name: "socketio",
  displayName: "Socket.IO",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "socket.io" },
  prompts: [
    {
      id: "client",
      type: "confirm",
      message: "Also add the socket.io-client browser example?",
      default: false,
    },
  ],
  setup: async (ctx, answers) => {
    const wantClient = answers.client === true;

    ctx.install(["socket.io"]);
    ctx.copy("files/socket.ts", "src/socket.ts");

    if (wantClient) {
      ctx.install(["socket.io-client"]);
      ctx.copy("files/socket-client.ts", "src/socket-client.ts");
    }

    // Wire a side-effect import into the backend entry (create it if absent).
    const entry = ctx.findOrCreate(
      ["src/server.ts", "src/index.ts"],
      "src/server.ts",
    );
    ctx.ensureImport(entry, { import: "./socket" });

    ctx.warn(
      "socket.io: src/socket.ts starts a standalone server on SOCKET_PORT " +
        "(default 3001). To attach to your existing HTTP server instead, pass " +
        "it to `new Server(httpServer, { cors })`.",
    );
  },
});
