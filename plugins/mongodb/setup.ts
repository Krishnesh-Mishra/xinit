import type { Ctx, Answers } from "@xinit/core";

/**
 * MongoDB via Mongoose. Depends on the `express` plugin (it wires the
 * connection into `src/server.ts`) and conflicts with `prisma-sqlite`.
 */
export default async function setup(ctx: Ctx, answers: Answers): Promise<void> {
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
}
