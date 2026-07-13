# postgres

Adds a PostgreSQL client to a backend — **cross-language**. The plugin branches
on the app's language (`ctx.language()`) and installs the idiomatic client for
each stack.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup pack plugins/postgres`.

- **Applies to:** any backend, `ts` / `js` / `python` (no `appliesTo`).
- Add-to-existing modifier; works with any HTTP framework.

## What it installs / patches

| Language  | Installs                    | File          | Client                                   |
| --------- | --------------------------- | ------------- | ---------------------------------------- |
| `python`  | `psycopg[binary]`           | `db.py`       | `psycopg.connect(DATABASE_URL)` helper   |
| `ts`      | `pg` + `@types/pg` (dev)    | `src/db.ts`   | shared `pg.Pool` from `DATABASE_URL`     |
| `js`      | `pg`                        | `src/db.js`   | shared `pg.Pool` from `DATABASE_URL`     |

`ctx.install` dispatches through the app's detected package manager — `uv add`
for a Python/uv app, `pnpm add`/`npm install`/… for a JS app — so the plugin only
picks package **names** per language, never the manager.

- **`.env`:** ensures `DATABASE_URL=postgres://postgres:postgres@localhost:5432/app`
  (seeded into `.env.example` too; an existing value is never overwritten).

Capabilities: `install` only — no exec, no network.
