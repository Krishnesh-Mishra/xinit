import { io } from "socket.io-client";

const SOCKET_URL = process.env.SOCKET_URL ?? "http://localhost:3001";

/** Shared Socket.IO client. */
export const socket = io(SOCKET_URL, { autoConnect: true });

socket.on("connect", () => {
  console.log(`Connected to Socket.IO server: ${socket.id}`);
});

socket.on("message", (payload) => {
  console.log("message:", payload);
});

socket.on("disconnect", () => {
  console.log("Disconnected from Socket.IO server");
});
