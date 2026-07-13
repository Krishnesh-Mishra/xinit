import { definePlugin } from "@initup/core";

/**
 * Tailwind CSS v4 for a React + Vite app.
 *
 * v4 is CSS-first: there is NO `tailwind.config.js` and NO PostCSS plugin
 * pipeline by default. Instead the official `@tailwindcss/vite` plugin is
 * registered in the Vite config and the stylesheet opts in with a single
 * `@import "tailwindcss";` line (which replaces the old three `@tailwind`
 * directives). Every LLM trained on v3 will get this wrong — this plugin
 * encodes the current, correct wiring once, deterministically.
 *
 * Named exactly "tailwind-v4" because heroui/shadcn `dependsOn` it.
 */
export default definePlugin({
  name: "tailwind-v4",
  displayName: "Tailwind CSS v4",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "tailwindcss" },
  prompts: [],
  setup: async (ctx) => {
    ctx.installDev(["tailwindcss", "@tailwindcss/vite"]);

    // Register the Vite plugin in the real config (extension varies per scaffold).
    ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });

    // Opt the global stylesheet into Tailwind. Create + wire it if the scaffold
    // has none. `position: top` keeps Tailwind's layers ahead of later imports.
    const css = ctx.stylesheet({ createIfMissing: true });
    ctx.ensureLine(css, '@import "tailwindcss";', { position: "top" });
  },
});
