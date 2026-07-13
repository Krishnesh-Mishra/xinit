# mongodb

Adds MongoDB (via Mongoose) to an Express backend.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/mongodb/plugin.ts`.

- **Depends on:** `express` (the connection is wired into `src/server.ts`).
- **Conflicts with:** `prisma-sqlite` (pick one database layer).

## Prompts

| id       | type | default | effect                                            |
| -------- | ---- | ------- | ------------------------------------------------- |
| `dbName` | text | `"app"` | Database name in the default `MONGODB_URI`.       |

## What it installs / patches

- **Installs:** `mongoose`.
- **Files:** `src/config/mongo.ts` (exports `connectDB`).
- **`.env`:** ensures `MONGODB_URI=mongodb://localhost:27017/<dbName>`.
- **`src/server.ts`:** ensures `import { connectDB } from "./config/mongo";`
  plus a `connectDB()` call.

Capabilities: `install` only — no exec, no network.
