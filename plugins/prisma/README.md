# prisma

Adds **Prisma ORM** to an existing Node backend.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/prisma/plugin.ts`.

- **Applies to:** `type: node-backend`.
- **Detect:** file `prisma/schema.prisma`.
- **Languages:** `ts`, `js`.

## Prompt

- **`provider`** (select): `postgresql` | `mysql` | `sqlite` (default `postgresql`).

## What it installs / patches

- **Installs:** `@prisma/client`. **Dev:** `prisma`.
- **`prisma/schema.prisma`:** a schema wired to the chosen `provider` with
  `url = env("DATABASE_URL")` and a starter `User` model.
- **`.env`:** appends a `DATABASE_URL` example for the chosen provider.
- **Script:** `db:generate` → `prisma generate`.

## Why this avoids `prisma init`

The interactive `prisma init` is non-deterministic and prompts. This plugin
writes the exact schema for the chosen provider instead, so the result is a
reviewable, idempotent plan. **You** run generate yourself when ready:

```
npx prisma generate   # or: pnpm db:generate
```

## Capabilities

`install` only — no exec, no network.
