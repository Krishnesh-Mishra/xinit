import type { Ctx, Answers } from "@xinit/core";

/**
 * HeroUI v3 for React + Tailwind v4.
 *
 * v3 is a hard break from v2: styles ship as a separate `@heroui/styles`
 * package imported from CSS, and there is NO `<HeroUIProvider>` wrapper anymore.
 * This plugin therefore does NOT touch the app entrypoint — it only installs
 * packages, registers the Tailwind v4 Vite plugin, and adds two CSS imports in
 * a load-bearing order (tailwind first, HeroUI second).
 */
export default async function setup(ctx: Ctx, _answers: Answers): Promise<void> {
  ctx.install(["@heroui/styles", "@heroui/react"]);
  ctx.installDev(["@tailwindcss/vite", "tailwindcss"]);

  ctx.patchConfig("vite.config.ts", {
    ensureImport: { tailwindcss: "@tailwindcss/vite" },
    addToArray: { path: "plugins", value: "tailwindcss()" },
  });

  // ORDER IS CRITICAL: Tailwind's layers must be declared before HeroUI's
  // styles so HeroUI can build on them. `after` pins the second import right
  // below the first (SPEC §6.4 — position-aware inserts).
  ctx.ensureLine("src/index.css", '@import "tailwindcss";', { position: "top" });
  ctx.ensureLine("src/index.css", '@import "@heroui/styles";', {
    after: '@import "tailwindcss";',
  });
}
