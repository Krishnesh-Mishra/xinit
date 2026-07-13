import { definePlugin } from "@initup/core";

/**
 * Bun runtime backend — a zero-dependency HTTP server on `Bun.serve`.
 *
 * Bun ships its own bundler, test runner and TypeScript support, and `Bun.serve`
 * needs no packages at all, so this plugin installs nothing and runs nothing:
 * ALL capabilities are false (honest — SPEC §7). It only writes files and a dev
 * script, then surfaces a manual `bun install` step via `ctx.warn`, because Bun
 * itself may not be present on the machine and initup must not try to run it.
 */
export default definePlugin({
  name: "bun",
  displayName: "Bun",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: false, exec: false, network: false },
  detect: { file: "bun.lockb" },
  prompts: [
    {
      id: "port",
      type: "text",
      message: "Which port should the server listen on?",
      default: "3000",
    },
  ],
  setup: async (ctx, answers) => {
    const port =
      typeof answers.port === "string" && answers.port.trim() !== ""
        ? answers.port.trim()
        : "3000";

    const entry = ctx.findOrCreate(
      ["src/index.ts", "src/server.ts"],
      "src/index.ts",
    );

    ctx.addFile(
      entry,
      `const server = Bun.serve({
  port: Number(process.env.PORT ?? ${port}),
  fetch(_req) {
    return Response.json({ status: "ok" });
  },
});

console.log(\`Server listening on http://localhost:\${server.port}\`);
`,
    );

    // Create a TypeScript config only if the project has none.
    ctx.findOrCreate(
      ["tsconfig.json"],
      "tsconfig.json",
      `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
`,
    );

    ctx.setScript("dev", `bun --watch ${entry}`);
    ctx.setScript("start", `bun ${entry}`);

    ctx.warn("Run 'bun install' to set up dependencies.");
  },
});
