# supabase

Adds the [Supabase](https://supabase.com) JavaScript client
(`@supabase/supabase-js`).

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/supabase/plugin.ts`.

## What it installs / patches

- **Installs:** `@supabase/supabase-js`.
- **Files:** `src/lib/supabase.ts` (or `.js`) — a shared `supabase` client from
  `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`.
- **`.env` / `.env.example`:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` placeholders.
  Existing values are preserved.

## Manual steps (surfaced as warnings)

- Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` from your project's API settings
  (Supabase dashboard → Project Settings → API). Never commit real keys.

Capabilities: `install` only — no exec, no network.
