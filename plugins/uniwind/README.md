# uniwind

Adds **Uniwind** — the fastest Tailwind CSS bindings for React Native
(Tailwind v4) — to a React Native / Expo app. This is the base that
`heroui-native` depends on.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/uniwind/plugin.ts`.

- **Applies to:** `framework: expo` (also React Native).
- **Detect:** dependency `uniwind`.
- **Languages:** `ts`, `js`.
- **No prompts.**

## What it installs / patches

- **Installs:** `uniwind`. **Dev:** `tailwindcss` (v4).
- **Global stylesheet** (`ctx.stylesheet({ createIfMissing: true })`): prepends
  `@import 'tailwindcss';`, then `@import 'uniwind';` immediately after it (order
  matters — Tailwind's layers must be declared first).
- **Metro config:** if none exists, writes a `metro.config.js` that wraps
  `getDefaultConfig` in `withUniwindConfig` (the required outermost wrapper) with
  the stylesheet above as `cssEntryFile`.

## Manual steps (surfaced as warnings)

Some steps compose with existing config and cannot be safely auto-written:

- **If a `metro.config.js` already exists**, XInit warns you to wrap it with
  `withUniwindConfig` from `uniwind/metro` as the **outermost** wrapper, rather
  than risk clobbering your config.
- **Babel:** add `'react-native-worklets/plugin'` to your `babel.config.js`
  plugins array, keeping existing presets untouched.

## Capabilities

`install` only — no exec, no network. Config is applied via recorded file writes;
anything that can't be safely automated is surfaced with `ctx.warn`.
