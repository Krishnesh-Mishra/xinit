import { definePlugin } from "@initup/core";

/**
 * SvelteKit base scaffold — a thin, non-interactive wrapper over the official
 * Svelte CLI (`sv create`, the current replacement for `create-svelte`).
 *
 * `npx sv create` runs a subprocess and downloads the template + add-on
 * definitions over the network, so this plugin declares `exec` + `network`. It
 * is invoked with `--no-install`, so it does NOT install dependencies
 * (`install` is false) and a `ctx.warn` reminds the user to install afterward.
 * `--no-dir-check` lets it scaffold into an app dir initup already created.
 */
export default definePlugin({
  name: "sveltekit",
  displayName: "SvelteKit",
  version: "1.0.0",
  appliesTo: { type: "new-app" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  // sv create scaffolds + downloads templates/add-ons; we skip its installer.
  capabilities: { install: false, exec: true, network: true },
  detect: { dependency: "@sveltejs/kit" },
  prompts: [
    { id: "ts", type: "confirm", message: "Use TypeScript?", default: true },
    {
      id: "template",
      type: "select",
      message: "Which project template?",
      choices: ["minimal", "demo", "library"],
      default: "minimal",
    },
    {
      id: "addons",
      type: "multiselect",
      message: "Which add-ons should be set up now?",
      choices: ["eslint", "prettier", "vitest", "playwright", "tailwindcss"],
      default: ["eslint", "prettier"],
    },
  ],
  setup: async (ctx, answers) => {
    const ts = answers.ts !== false;
    const allowedTemplates = ["minimal", "demo", "library"];
    const template =
      typeof answers.template === "string" && allowedTemplates.includes(answers.template)
        ? answers.template
        : "minimal";
    const addons = Array.isArray(answers.addons)
      ? (answers.addons as string[])
      : [];

    const flags = [
      `--template ${template}`,
      `--types ${ts ? "ts" : "jsdoc"}`,
      // `--add <names...>` sets up official add-ons; else skip the prompt.
      addons.length > 0 ? `--add ${addons.join(" ")}` : "--no-add-ons",
      "--no-install",
      "--no-dir-check",
    ];

    ctx.run(`npx sv create . ${flags.join(" ")}`);

    ctx.warn(
      "sv create was invoked with --no-install — run your package manager install (e.g. `pnpm install`) in the new app.",
    );
  },
});
