import { definePlugin } from "@initup/core";

/**
 * PostgreSQL client — cross-language (JS/TS + Python).
 *
 * Branches on `ctx.language()`:
 * - **python** → installs `psycopg[binary]` (psycopg 3 with prebuilt binaries)
 *   and drops `db.py`, a `psycopg.connect(DATABASE_URL)` helper.
 * - **ts/js** → installs `pg` (plus `@types/pg` on TS) and drops
 *   `src/db.{ts,js}`, a shared `pg.Pool` built from `DATABASE_URL`.
 *
 * `ctx.install` auto-dispatches through the app's detected manager (`uv add` for
 * Python, `pnpm add`/… for JS), so the plugin only branches package NAMES and
 * file contents — never the manager.
 *
 * install-only — no exec, no network. Applies to any backend (no `appliesTo`).
 */
export default definePlugin({
  name: "postgres",
  displayName: "PostgreSQL",
  version: "1.0.0",
  languages: ["ts", "js", "python"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "pg" },
  prompts: [],
  setup: (ctx) => {
    const lang = ctx.language();

    if (lang === "python") {
      // psycopg 3; `[binary]` ships prebuilt wheels (no local libpq build).
      ctx.install(["psycopg[binary]"]);
      ctx.addFile(
        "db.py",
        `import os

import psycopg

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgres://postgres:postgres@localhost:5432/app"
)


def get_connection() -> psycopg.Connection:
    """Open a new PostgreSQL connection from DATABASE_URL."""
    return psycopg.connect(DATABASE_URL)
`,
      );
    } else {
      const ext = lang === "ts" ? "ts" : "js";
      ctx.install(["pg"]);
      if (lang === "ts") ctx.installDev(["@types/pg"]);
      ctx.addFile(
        `src/db.${ext}`,
        `import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/app";

/** Shared connection pool. Reuse across the app; do not create per-request. */
export const pool = new Pool({ connectionString });

export default pool;
`,
      );
    }

    // Env-aware upsert: preserves an existing DATABASE_URL, seeds .env.example.
    ctx.setEnv(
      "DATABASE_URL",
      "postgres://postgres:postgres@localhost:5432/app",
      { example: true },
    );
  },
});
