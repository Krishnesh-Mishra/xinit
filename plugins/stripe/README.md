# stripe

Adds the [Stripe](https://stripe.com) Node SDK and a shared server-side client.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/stripe/plugin.ts`.

## What it installs / patches

- **Installs:** `stripe`.
- **Files:** `src/lib/stripe.ts` (or `.js`) — exports
  `stripe = new Stripe(process.env.STRIPE_SECRET_KEY)`. Server-side only.
- **`.env` / `.env.example`:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  placeholders. Existing values are preserved.

## Manual steps (surfaced as warnings)

- Set `STRIPE_SECRET_KEY` from your Stripe dashboard (Developers → API keys).
- `STRIPE_WEBHOOK_SECRET` is shown when you create a webhook endpoint or run
  `stripe listen`. Keep both server-side only.

Capabilities: `install` only — no exec, no network.
