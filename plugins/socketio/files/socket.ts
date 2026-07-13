import { createServer } from "node:http";
import { Server } from "socket.io";

const SOCKET_PORT = Number(process.env.SOCKET_PORT ?? 3001);

const httpServer = createServer();

/**
 * Standalone Socket.IO server.
 *
 * To attach to an existing HTTP server instead of running standalone, pass that
 * server here: `new Server(existingServer, { cors: { origin: "*" } })`.
 */
export const io = new Server(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("message", (payload) => {
    // Broadcast every message to all connected clients.
    io.emit("message", payload);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

httpServer.listen(SOCKET_PORT, () => {
  console.log(`Socket.IO server listening on http://localhost:${SOCKET_PORT}`);
});
