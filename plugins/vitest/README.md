# vitest

Adds **Vitest** — the Vite-native, Jest-compatible test runner for JS/TS.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/vitest/plugin.ts`.

- **Applies to:** any JS/TS app (no framework restriction).
- **Languages:** `ts`, `js`.
- **Detect:** dependency `vitest`.
- **No prompts.**

## What it installs / creates

- **Dev install:** `vitest`.
- **`vitest.config.ts` / `.js`:** a `defineConfig` from `vitest/config`
  (Node environment, `src/**/*.{test,spec}.{js,ts}` includes). Extension follows
  the app's language.
- **`src/example.test.ts` / `.js`:** a trivial passing test to prove the setup.
- **Script:** `test` → `vitest run` (single-shot, CI-friendly).

## Capabilities

`install` only — no exec, no network. Apply never runs the suite; run
`pnpm test` yourself.
