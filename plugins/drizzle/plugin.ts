import { definePlugin } from "@initup/core";

/**
 * Drizzle ORM for a Node backend.
 *
 * The `driver` prompt picks the SQL flavour; that single answer determines the
 * runtime driver package, the drizzle-kit `dialect`, the schema-builder import,
 * and the example connection string. Everything is written deterministically —
 * `drizzle.config.ts`, a starter `src/db/schema.ts`, the `DATABASE_URL`
 * placeholder, and a `db:push` script — so the plugin stays install-only. The
 * user runs `drizzle-kit push` (via `db:push`) when ready.
 */
export default definePlugin({
  name: "drizzle",
  displayName: "Drizzle ORM",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "drizzle-orm" },
  prompts: [
    {
      id: "driver",
      type: "select",
      message: "Which database driver?",
      choices: ["pg", "mysql", "sqlite"],
      default: "pg",
    },
  ],
  setup: async (ctx, answers) => {
    const driver =
      answers.driver === "mysql" || answers.driver === "sqlite"
        ? answers.driver
        : "pg";

    // driver → { runtime package, drizzle-kit dialect, example url, schema src }
    const cfg = {
      pg: {
        pkg: "postgres",
        dialect: "postgresql",
        url: "postgres://user:password@localhost:5432/mydb",
        schema: `import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});
`,
      },
      mysql: {
        pkg: "mysql2",
        dialect: "mysql",
        url: "mysql://user:password@localhost:3306/mydb",
        schema: `import { mysqlTable, int, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
});
`,
      },
      sqlite: {
        pkg: "better-sqlite3",
        dialect: "sqlite",
        url: "file:./sqlite.db",
        schema: `import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});
`,
      },
    }[driver];

    ctx.install(["drizzle-orm", cfg.pkg]);
    ctx.installDev(["drizzle-kit"]);

    ctx.addFile(
      "drizzle.config.ts",
      `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "${cfg.dialect}",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
`,
    );

    ctx.addFile("src/db/schema.ts", cfg.schema);

    // Env-aware upsert: preserves an existing DATABASE_URL, seeds .env.example.
    ctx.setEnv("DATABASE_URL", cfg.url, { example: true });

    ctx.setScript("db:push", "drizzle-kit push");
  },
});
