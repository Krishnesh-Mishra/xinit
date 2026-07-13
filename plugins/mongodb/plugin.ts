import { definePlugin } from "@xinit/core";

/**
 * MongoDB via Mongoose. Depends on the `express` plugin (it wires the
 * connection into `src/server.ts`) and conflicts with `prisma-sqlite`.
 */
export default definePlugin({
  name: "mongodb",
  displayName: "MongoDB (Mongoose)",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
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

    // Idempotent, CRLF-safe line insert (SPEC §6.3).
    ctx.ensureLine(".env", `MONGODB_URI=mongodb://localhost:27017/${dbName}`, {
      position: "bottom",
    });

    ctx.copy("files/mongo.ts", "src/config/mongo.ts");

    // Ensure the import + a `connectDB()` call in the Express entrypoint.
    ctx.ensureImport("src/server.ts", {
      import: `import { connectDB } from "./config/mongo";`,
      call: "connectDB()",
    });
  },
});
