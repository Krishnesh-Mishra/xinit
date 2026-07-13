# trpc

Adds [tRPC v11](https://trpc.io) — end-to-end typesafe APIs — as an install-only
scaffold.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/trpc/plugin.ts`.

## What it installs / patches

- **Installs:** `@trpc/server`, `@trpc/client`.
- **Files:**
  - `src/server/router.ts` (or `.js`) — `initTRPC.create()`, a sample
    `greeting` query, and the exported `AppRouter` type (TS only).
  - `src/lib/trpc.ts` (or `.js`) — a vanilla `createTRPCClient` wired with
    `httpBatchLink`.

## Manual steps (surfaced as warnings)

- Mount `appRouter` on an HTTP handler for your framework (standalone adapter,
  Next.js `fetchRequestHandler`, Express middleware, …) and align the client
  `url` with where it is served.

Capabilities: `install` only — no exec, no network.
