import type { Ctx, Answers } from "@xinit/core";

/**
 * shadcn/ui — a thin wrapper over the official `shadcn` CLI.
 *
 * The CLI both runs a subprocess (`npx`) and downloads component source over
 * the network, so this plugin declares `exec` + `network` capabilities. Per
 * SPEC §8 that trips the consent gate: in AI mode `add_plugin` returns
 * `confirmation_required` with a `confirmToken` before anything runs.
 */
export default async function setup(ctx: Ctx, answers: Answers): Promise<void> {
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
}
