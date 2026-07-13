# heroui-native

Adds **HeroUI Native** to a React Native / Expo app (built on **Uniwind** +
**Tailwind v4**).

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/heroui-native/plugin.ts`.

- **Applies to:** `framework: expo` (also React Native).
- **Depends on:** `uniwind`.
- **Detect:** dependency `heroui-native`.
- **Languages:** `ts`, `js`.
- **No prompts.**

## Why this plugin exists

HeroUI Native's install is an exact, multi-step sequence that is easy to get
wrong by hand or from a stale guide. XInit encodes the *current, correct* steps
once, deterministically, so it is never done wrong:

1. **Install** the component package: `heroui-native`.
2. **Install** the pinned peer dependencies, exactly:
   `react-native-reanimated@^4.1.1`, `react-native-gesture-handler@^2.28.0`,
   `react-native-worklets@^0.5.1`, `react-native-safe-area-context@^5.6.0`,
   `react-native-svg@^15.12.1`, `tailwind-variants@^3.2.2`,
   `tailwind-merge@^3.4.0`.
3. **CSS imports in a load-bearing order** on the global stylesheet
   (`ctx.stylesheet({ createIfMissing: true })`):
   `@import 'tailwindcss';` (top) → `@import 'uniwind';` (after tailwindcss) →
   `@import 'heroui-native/styles';` (after uniwind). Order is enforced with
   position-aware `ensureLine` inserts (SPEC §6.4).
4. **Provider wiring** on the app entry (`ctx.entryFile()`): wrap the root in
   `GestureHandlerRootView` (outermost, `style={{ flex: 1 }}`) then
   `HeroUINativeProvider`.

## Provider wiring is automated

The manual `<GestureHandlerRootView>` / `<HeroUINativeProvider>` wrapping that
older (v3-style) guides tell you to write by hand is automated by `ctx.wrap` — a
format-preserving JSX codemod. It is idempotent, and if it cannot locate the app
root it leaves the file untouched and surfaces a **manual-step warning** instead
(SPEC §5), so the file is never corrupted.

## Capabilities

`install` only — no exec, no network. Everything is a recorded, reversible file
write plus batched installs.
