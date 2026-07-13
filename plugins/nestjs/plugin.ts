import { definePlugin } from "@initup/core";

/**
 * NestJS backend — a thin wrapper over the official Nest CLI.
 *
 * `@nestjs/cli new` scaffolds the whole project (TypeScript sources, config,
 * tests) AND installs dependencies over the network, so this plugin declares
 * `exec` + `network`. Per SPEC §8 that trips the consent gate for third-party
 * trust: `add_plugin` returns `confirmation_required` with a `confirmToken`
 * before anything runs. `--package-manager` is passed so the CLI never stops to
 * prompt, keeping the run non-interactive.
 */
export default definePlugin({
  name: "nestjs",
  displayName: "NestJS",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: true, network: true },
  detect: { dependency: "@nestjs/core" },
  prompts: [
    {
      id: "packageManager",
      type: "select",
      message: "Which package manager should Nest use?",
      choices: ["pnpm", "npm", "yarn"],
      default: "pnpm",
    },
  ],
  setup: async (ctx, answers) => {
    const pm =
      typeof answers.packageManager === "string" &&
      answers.packageManager.trim() !== ""
        ? answers.packageManager.trim()
        : "pnpm";

    // Scaffold in the current directory (".") — non-interactive: --package-manager
    // pre-answers the CLI's only prompt, --skip-git leaves VCS to the caller,
    // --strict turns on TypeScript's strict compiler flags.
    ctx.run(
      `npx @nestjs/cli new . --skip-git --strict --package-manager ${pm}`,
    );
  },
});
