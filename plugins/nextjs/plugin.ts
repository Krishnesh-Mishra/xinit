import { definePlugin } from "@initup/core";

/**
 * Next.js base scaffold — a thin, non-interactive wrapper over the official
 * `create-next-app` CLI.
 *
 * The CLI runs a subprocess (`npx`), downloads packages over the network, and
 * installs them, so this plugin declares `install` + `exec` + `network`. Its
 * effect is opaque (SPEC §5), so the Plan carries only the command string — a
 * weaker guarantee than a patch plugin. Answers map to non-interactive flags;
 * `--yes` fills any option we don't set with the CLI's defaults so nothing
 * prompts.
 */
export default definePlugin({
  name: "nextjs",
  displayName: "Next.js",
  version: "1.0.0",
  appliesTo: { type: "new-app" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  // create-next-app scaffolds, downloads, AND installs (via --use-pnpm).
  capabilities: { install: true, exec: true, network: true },
  detect: { dependency: "next" },
  prompts: [
    { id: "ts", type: "confirm", message: "Use TypeScript?", default: true },
    { id: "app", type: "confirm", message: "Use the App Router?", default: true },
    { id: "srcDir", type: "confirm", message: "Put code inside a `src/` directory?", default: false },
    { id: "tailwind", type: "confirm", message: "Add Tailwind CSS?", default: true },
    { id: "eslint", type: "confirm", message: "Add ESLint?", default: true },
  ],
  setup: async (ctx, answers) => {
    // Confirm defaults: ts/app/tailwind/eslint default true, srcDir default false.
    const ts = answers.ts !== false;
    const app = answers.app !== false;
    const srcDir = answers.srcDir === true;
    const tailwind = answers.tailwind !== false;
    const eslint = answers.eslint !== false;

    // Every choice is emitted explicitly (positive OR negated flag) so the
    // command is deterministic; `--yes` skips any remaining prompt (e.g.
    // Turbopack / React Compiler) using the CLI defaults.
    const flags = [
      ts ? "--ts" : "--js",
      app ? "--app" : "--no-app",
      srcDir ? "--src-dir" : "--no-src-dir",
      tailwind ? "--tailwind" : "--no-tailwind",
      eslint ? "--eslint" : "--no-eslint",
      '--import-alias "@/*"',
      "--use-pnpm",
      "--yes",
    ];

    ctx.run(`npx create-next-app@latest . ${flags.join(" ")}`);
  },
});
