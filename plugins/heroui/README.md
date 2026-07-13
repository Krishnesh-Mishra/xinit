# heroui

Adds **HeroUI v3** to a React + Tailwind v4 app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/heroui/plugin.ts`.

- **Applies to:** `framework: react`.
- **Depends on:** `tailwind-v4`.
- **Requires:** `react >=19`, `tailwindcss >=4` (checked, fails loudly if unmet).
- **No prompts.**

## What it installs / patches

- **Installs:** `@heroui/styles`, `@heroui/react`. **Dev:** `@tailwindcss/vite`,
  `tailwindcss`.
- **`vite.config.ts`:** registers `tailwindcss()` from `@tailwindcss/vite`.
- **`src/index.css`:** prepends `@import "tailwindcss";`, then inserts
  `@import "@heroui/styles";` immediately after it.

## Why this is XInit's headline "staleness trap"

Every LLM trained on HeroUI **v2** will confidently add a `<HeroUIProvider>`
wrapper and a `tailwind.config` `plugins: [heroui()]` entry, plus the
`@heroui/theme` package. **All of that is wrong for v3:**

- v3 has **no `HeroUIProvider`** — there is no provider component to mount.
- v3 uses **Tailwind v4** (CSS-first, `@tailwindcss/vite`), not a JS
  `tailwind.config` plugin.
- Styles come from **`@heroui/styles`** imported in CSS, in a specific order.

XInit encodes the *current, correct* steps once, deterministically — so you get
v3 wiring instead of a plausible-looking v2 answer that fails at runtime.

Capabilities: `install` only — no exec, no network.
