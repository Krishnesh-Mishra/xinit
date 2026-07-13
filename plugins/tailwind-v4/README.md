# tailwind-v4

Adds **Tailwind CSS v4** to a React + Vite app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/tailwind-v4/plugin.ts`.

- **Applies to:** `framework: react`.
- **No prompts.**

## What it installs / patches

- **Dev deps:** `tailwindcss`, `@tailwindcss/vite`.
- **Vite config:** registers `tailwindcss()` from `@tailwindcss/vite`.
- **Global stylesheet:** prepends `@import "tailwindcss";` (creating and wiring
  the stylesheet into the entry file if the scaffold has none).

## Why this is the current, correct wiring

Tailwind v4 is **CSS-first**. Every LLM trained on v3 will confidently add a
`tailwind.config.js`, a PostCSS `plugins` block, and the three `@tailwind
base/components/utilities` directives. **All of that is obsolete in v4:**

- v4 has **no `tailwind.config.js`** by default — configuration is CSS-first.
- v4 uses the **`@tailwindcss/vite`** plugin, not `postcss` + `autoprefixer`.
- The stylesheet opts in with a single **`@import "tailwindcss";`**, replacing
  the old `@tailwind` directives.

Named exactly **`tailwind-v4`** so `heroui` and `shadcn` can `dependsOn` it.

Capabilities: `install` only — no exec, no network.
