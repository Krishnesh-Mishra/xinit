import { definePlugin } from "@initup/core";

/**
 * SQLAlchemy — the Python SQL toolkit + ORM, wired for a Python app.
 *
 * Installs `sqlalchemy` through the app's detected manager (`ctx.install` →
 * `uv add` / `poetry add` / `pip install`) and drops a `db.py` module with the
 * canonical SQLAlchemy 2.0 trio: an `engine`, a `SessionLocal` session factory,
 * and a declarative `Base` (via `DeclarativeBase`). The connection string is read
 * from `DATABASE_URL`, which is seeded into `.env`/`.env.example` with a local
 * Postgres (psycopg 3) default.
 *
 * Optionally installs Alembic (the migrations tool, prompted, default on) as a
 * dev dependency. Running `alembic init` is an exec/scaffold step, so it's left
 * to the developer via `ctx.warn` — the plugin stays install-only (no exec, no
 * network).
 */
export default definePlugin({
  name: "sqlalchemy",
  displayName: "SQLAlchemy",
  version: "1.0.0",
  languages: ["python"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "sqlalchemy" },
  prompts: [
    {
      id: "alembic",
      type: "confirm",
      message: "Also install Alembic for database migrations?",
      default: true,
    },
  ],
  setup: (ctx, answers) => {
    // Manager-agnostic: `uv add sqlalchemy`, `poetry add sqlalchemy`, …
    ctx.install(["sqlalchemy"]);

    // Alembic is opt-out (default true). Installed as a dev-only tool.
    if (answers.alembic !== false) {
      ctx.installDev(["alembic"]);
      ctx.warn("Run 'alembic init migrations' to set up migrations.");
    }

    ctx.addFile(
      "db.py",
      `"""Database engine, session factory, and declarative base (SQLAlchemy 2.0)."""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://localhost/app"
)

# The Engine manages the connection pool; create it once at module scope.
engine = create_engine(DATABASE_URL)

# A configured factory for Session objects, bound to the engine.
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Declarative base class for ORM models."""
`,
    );

    // psycopg 3 URL scheme; setEnv never clobbers an existing value and also
    // seeds a committed .env.example template.
    ctx.setEnv("DATABASE_URL", "postgresql+psycopg://localhost/app", {
      example: true,
    });
  },
});
