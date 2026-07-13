# better-auth

Adds [Better Auth](https://www.better-auth.com) — framework-agnostic
authentication for TypeScript/JavaScript.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/better-auth/plugin.ts`.

## What it installs / patches

- **Installs:** `better-auth`.
- **Files:** `src/lib/auth.ts` (or `.js`) — exports `auth = betterAuth({...})`
  with email/password enabled as a starting point.
- **`.env` / `.env.example`:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (read by
  Better Auth automatically). Existing values are preserved.

## Manual steps (surfaced as warnings)

- Mount the handler on a catch-all route for your framework
  (`toNextJsHandler`, `toNodeHandler`, …).
- Generate a real `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and point
  `BETTER_AUTH_URL` at your app before deploying.
- Pick and configure a database adapter.

Capabilities: `install` only — no exec, no network.
