import { WebSocketServer } from "ws";

const WS_PORT = Number(process.env.WS_PORT ?? 8080);

/**
 * Standalone WebSocket server.
 *
 * To share a port with an existing HTTP server, construct it with
 * `new WebSocketServer({ server })` (or `{ noServer: true }` and handle the
 * `upgrade` event yourself) instead of `{ port }`.
 */
export const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (socket) => {
  console.log("WebSocket client connected");

  socket.on("message", (data) => {
    // Echo back received messages.
    socket.send(`echo: ${data}`);
  });

  socket.on("close", () => {
    console.log("WebSocket client disconnected");
  });
});

console.log(`WebSocket server listening on ws://localhost:${WS_PORT}`);
