# sqlalchemy

Adds **SQLAlchemy** (the Python SQL toolkit + ORM) to a Python app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/sqlalchemy/plugin.ts`.

- **Languages:** `python`.
- **Detect:** dependency `sqlalchemy`.

## What it installs / writes

- **Installs:** `sqlalchemy`, dispatched through the app's manager (`uv add` on a
  uv project, else `poetry add` / `pip install`).
- **Prompts:** _"Also install Alembic for database migrations?"_ (confirm, default
  **yes**). When kept, `alembic` is added as a **dev** dependency and a manual
  step (`alembic init migrations`) is surfaced.
- **`db.py`** — the canonical SQLAlchemy 2.0 setup: an `engine`, a `SessionLocal`
  session factory, and a declarative `Base`, with the connection string read from
  `DATABASE_URL`:

  ```python
  import os

  from sqlalchemy import create_engine
  from sqlalchemy.orm import DeclarativeBase, sessionmaker

  DATABASE_URL = os.environ.get(
      "DATABASE_URL", "postgresql+psycopg://localhost/app"
  )

  engine = create_engine(DATABASE_URL)
  SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


  class Base(DeclarativeBase):
      """Declarative base class for ORM models."""
  ```

- **`.env` / `.env.example`:** seeds
  `DATABASE_URL=postgresql+psycopg://localhost/app` (psycopg 3 URL scheme;
  existing values are never overwritten).

## Migrations

Setting up Alembic is an exec/scaffold step, so it is left to you:

```
alembic init migrations
```

## Capabilities

`install` only — no exec, no network.
