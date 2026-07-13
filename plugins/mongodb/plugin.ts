import { definePlugin } from "@initup/core";

/**
 * MongoDB via Mongoose. Depends on the `express` plugin (it wires the
 * connection into `src/server.ts`) and conflicts with `prisma-sqlite`.
 */
export default definePlugin({
  name: "mongodb",
  displayName: "MongoDB (Mongoose)",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: ["express"],
  conflicts: ["prisma-sqlite"],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "mongoose" },
  prompts: [
    { id: "dbName", type: "text", message: "Database name?", default: "app" },
  ],
  setup: async (ctx, answers) => {
    const dbName =
      typeof answers.dbName === "string" && answers.dbName.trim() !== ""
        ? answers.dbName.trim()
        : "app";

    ctx.install(["mongoose"]);

    // Env-aware upsert: never clobbers a developer's existing MONGODB_URI, and
    // seeds a committed .env.example. (SPEC §5.)
    ctx.setEnv("MONGODB_URI", `mongodb://localhost:27017/${dbName}`, {
      example: true,
    });

    ctx.copy("files/mongo.ts", "src/config/mongo.ts");

    // Bind `connectDB` (a named export of files/mongo.ts) and ensure the call in
    // the Express entrypoint. `ensureImport` adds both the import and the call.
    ctx.ensureImport("src/server.ts", {
      named: ["connectDB"],
      from: "./config/mongo",
      call: "connectDB()",
    });
  },
});
