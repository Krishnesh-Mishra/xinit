import { definePlugin } from "@initup/core";

/**
 * Prisma ORM for a Node backend.
 *
 * Deliberately deterministic: instead of the interactive `prisma init`, this
 * plugin installs the CLI + client, writes a `schema.prisma` wired to the chosen
 * provider, and records the `DATABASE_URL` placeholder. `prisma generate` is
 * exposed as an npm script (`db:generate`) rather than executed — so this plugin
 * stays install-only (no exec/network) and the user runs generate when ready.
 */
export default definePlugin({
  name: "prisma",
  displayName: "Prisma",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { file: "prisma/schema.prisma" },
  prompts: [
    {
      id: "provider",
      type: "select",
      message: "Which database provider?",
      choices: ["postgresql", "mysql", "sqlite"],
      default: "postgresql",
    },
  ],
  setup: async (ctx, answers) => {
    const provider =
      answers.provider === "mysql" || answers.provider === "sqlite"
        ? answers.provider
        : "postgresql";

    // Example connection string for the chosen provider.
    const url =
      provider === "sqlite"
        ? "file:./dev.db"
        : provider === "mysql"
          ? "mysql://user:password@localhost:3306/mydb"
          : "postgresql://user:password@localhost:5432/mydb?schema=public";

    ctx.installDev(["prisma"]);
    ctx.install(["@prisma/client"]);

    ctx.addFile(
      "prisma/schema.prisma",
      `// Prisma schema — https://pris.ly/d/prisma-schema
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${provider}"
  url      = env("DATABASE_URL")
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
`,
    );

    // Env-aware upsert: preserves an existing DATABASE_URL, seeds .env.example.
    ctx.setEnv("DATABASE_URL", url, { example: true });

    // The user runs `npx prisma generate` (or `pnpm db:generate`) themselves.
    ctx.setScript("db:generate", "prisma generate");
  },
});
