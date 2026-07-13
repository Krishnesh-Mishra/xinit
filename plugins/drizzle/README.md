# drizzle

Adds **Drizzle ORM** to an existing Node backend.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/drizzle/plugin.ts`.

- **Applies to:** `type: node-backend`.
- **Detect:** dependency `drizzle-orm`.
- **Languages:** `ts`, `js`.

## Prompt

- **`driver`** (select): `pg` | `mysql` | `sqlite` (default `pg`). This single
  answer picks the runtime driver package, the drizzle-kit `dialect`, and the
  schema-builder imports:

  | driver | package | dialect |
  | --- | --- | --- |
  | `pg` | `postgres` | `postgresql` |
  | `mysql` | `mysql2` | `mysql` |
  | `sqlite` | `better-sqlite3` | `sqlite` |

## What it installs / patches

- **Installs:** `drizzle-orm`, plus the driver package. **Dev:** `drizzle-kit`.
- **`drizzle.config.ts`:** `defineConfig` with the chosen `dialect`,
  `schema: "./src/db/schema.ts"`, and `dbCredentials.url = process.env.DATABASE_URL`.
- **`src/db/schema.ts`:** a starter `users` table using the driver's schema core.
- **`.env`:** appends a `DATABASE_URL` example for the chosen driver.
- **Script:** `db:push` → `drizzle-kit push`.

## Capabilities

`install` only — no exec, no network. You run `drizzle-kit push` (via `db:push`)
when ready.
