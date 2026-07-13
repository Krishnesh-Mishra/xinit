import { definePlugin } from "@xinit/core";

/**
 * shadcn/ui — a thin wrapper over the official `shadcn` CLI.
 *
 * The CLI both runs a subprocess (`npx`) and downloads component source over
 * the network, so this plugin declares `exec` + `network` capabilities. Per
 * SPEC §8 that trips the consent gate: in AI mode `add_plugin` returns
 * `confirmation_required` with a `confirmToken` before anything runs.
 */
export default definePlugin({
  name: "shadcn",
  displayName: "shadcn/ui",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  dependsOn: ["tailwind-v4"],
  conflicts: [],
  capabilities: { install: true, exec: true, network: true },
  detect: { file: "components.json" },
  prompts: [
    {
      id: "components",
      type: "multiselect",
      message: "Which components should be added now?",
      choices: ["button", "input", "card", "dialog"],
      default: [],
    },
  ],
  setup: async (ctx, answers) => {
    // Path alias so shadcn's generated `@/...` imports resolve.
    ctx.patchJson("tsconfig.json", {
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
    });

    ctx.patchConfig("vite.config.ts", {
      ensureImport: { path: "node:path" },
      merge: {
        resolve: {
          alias: { "@": "path.resolve(__dirname, './src')" },
        },
      },
    });

    // exec + network: initialize shadcn (writes components.json, ui deps).
    ctx.run("npx shadcn@latest init -d");

    const components = Array.isArray(answers.components)
      ? (answers.components as string[])
      : [];
    if (components.length > 0) {
      ctx.run("npx shadcn@latest add " + components.join(" "));
    }
  },
});
