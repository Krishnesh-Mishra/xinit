import { definePlugin } from "@initup/core";

/**
 * HeroUI v3 for React + Tailwind v4.
 *
 * v3 is a hard break from v2: styles ship as a separate `@heroui/styles`
 * package imported from CSS, and there is NO `<HeroUIProvider>` wrapper anymore.
 * This plugin therefore does NOT touch the app entrypoint — it only installs
 * packages, registers the Tailwind v4 Vite plugin, and adds two CSS imports in
 * a load-bearing order (tailwind first, HeroUI second).
 */
export default definePlugin({
  name: "heroui",
  displayName: "HeroUI v3",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  dependsOn: ["tailwind-v4"],
  conflicts: [],
  requires: { react: ">=19", tailwindcss: ">=4" },
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "@heroui/react" },
  prompts: [],
  setup: async (ctx) => {
    ctx.install(["@heroui/styles", "@heroui/react"]);
    ctx.installDev(["@tailwindcss/vite", "tailwindcss"]);

    // Resolve the real Vite config (extension varies) rather than hardcoding.
    ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });

    // Locate (or create + wire) the global stylesheet instead of assuming
    // "src/index.css" — its location varies across scaffolds.
    const css = ctx.stylesheet({ createIfMissing: true });

    // ORDER IS CRITICAL: Tailwind's layers must be declared before HeroUI's
    // styles so HeroUI can build on them. `after` pins the second import right
    // below the first (SPEC §6.4 — position-aware inserts).
    ctx.ensureLine(css, '@import "tailwindcss";', { position: "top" });
    ctx.ensureLine(css, '@import "@heroui/styles";', {
      after: '@import "tailwindcss";',
    });
  },
});
