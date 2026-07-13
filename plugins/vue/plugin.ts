import { definePlugin } from "@xinit/core";

/**
 * Vue (Vite) base scaffold — a thin, non-interactive wrapper over the official
 * `create-vue` CLI (`npm create vue@latest`).
 *
 * The CLI runs a subprocess (`npx`/`npm create`) and downloads the generator
 * over the network, so this plugin declares `exec` + `network`. `create-vue`
 * does NOT install dependencies, so `install` is false and a `ctx.warn` reminds
 * the user to run their package manager afterward. Any single feature flag puts
 * `create-vue` into non-interactive mode; when the user selects nothing we pass
 * `--default` so it still never prompts.
 */
export default definePlugin({
  name: "vue",
  displayName: "Vue (Vite)",
  version: "1.0.0",
  appliesTo: { type: "new-app" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  // create-vue scaffolds + downloads the generator but does NOT install deps.
  capabilities: { install: false, exec: true, network: true },
  detect: { dependency: "vue" },
  prompts: [
    { id: "ts", type: "confirm", message: "Use TypeScript?", default: true },
    { id: "router", type: "confirm", message: "Add Vue Router (SPA)?", default: false },
    { id: "pinia", type: "confirm", message: "Add Pinia for state management?", default: false },
    { id: "vitest", type: "confirm", message: "Add Vitest for unit testing?", default: false },
    { id: "eslint", type: "confirm", message: "Add ESLint?", default: false },
    { id: "prettier", type: "confirm", message: "Add Prettier?", default: false },
  ],
  setup: async (ctx, answers) => {
    const ts = answers.ts !== false;
    const router = answers.router === true;
    const pinia = answers.pinia === true;
    const vitest = answers.vitest === true;
    const eslint = answers.eslint === true;
    const prettier = answers.prettier === true;

    // create-vue feature flags are opt-in booleans (no `--no-*`): only push the
    // ones that are enabled.
    const flags: string[] = [];
    if (ts) flags.push("--ts");
    if (router) flags.push("--router");
    if (pinia) flags.push("--pinia");
    if (vitest) flags.push("--vitest");
    if (eslint) flags.push("--eslint");
    if (prettier) flags.push("--prettier");
    // No feature selected ⇒ pass --default so the CLI stays non-interactive.
    if (flags.length === 0) flags.push("--default");

    // `.` scaffolds into the app dir; `--force` allows a non-empty target.
    // npm needs `--` to forward flags through to create-vue.
    ctx.run(`npm create vue@latest . -- ${flags.join(" ")} --force`);

    ctx.warn(
      "create-vue does not install dependencies — run your package manager install (e.g. `pnpm install`) in the new app.",
    );
  },
});
