# biome

Adds **Biome** (v2) — one fast toolchain that lints **and** formats JS/TS/JSON,
replacing the ESLint + Prettier pair with a single dependency.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/biome/plugin.ts`.

- **Applies to:** any JS/TS app (no framework restriction).
- **Languages:** `ts`, `js`.
- **Detect:** file `biome.json`.
- **No prompts.**

## What it installs / creates

- **Dev install:** `@biomejs/biome`.
- **`biome.json`:** the current recommended config — formatter and linter both
  enabled, recommended lint rules, and import organizing via the assist actions.
- **Scripts:**
  - `lint` → `biome check .`
  - `format` → `biome format --write .`

## Capabilities

`install` only — no exec, no network. Apply never runs Biome against your
source; run `pnpm lint` / `pnpm format` yourself.
