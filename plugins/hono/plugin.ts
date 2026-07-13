import { definePlugin } from "@xinit/core";

/**
 * Hono — the ultrafast Web-Standards framework, wired for the chosen runtime.
 *
 * Fully deterministic and install-only. Hono itself is runtime-agnostic; the
 * only thing that varies is the server adapter and dev command, so this is a
 * linear `if`/`else` over the `runtime` answer (SPEC §4 — logic in code, not a
 * JSON DSL). No exec, no network — every effect is a recorded, reversible write.
 */
export default definePlugin({
  name: "hono",
  displayName: "Hono",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "hono" },
  prompts: [
    {
      id: "runtime",
      type: "select",
      message: "Which runtime should Hono target?",
      choices: ["node", "bun", "cloudflare"],
      default: "node",
    },
    {
      id: "port",
      type: "text",
      message: "Which port should the server listen on?",
      default: "3000",
    },
  ],
  setup: async (ctx, answers) => {
    const runtime =
      typeof answers.runtime === "string" &&
      ["node", "bun", "cloudflare"].includes(answers.runtime)
        ? answers.runtime
        : "node";
    const port =
      typeof answers.port === "string" && answers.port.trim() !== ""
        ? answers.port.trim()
        : "3000";

    ctx.install(["hono"]);

    const routes = `const app = new Hono();

app.get("/", (c) => c.json({ status: "ok" }));`;

    if (runtime === "node") {
      // @hono/node-server is the official Node adapter (hono.dev/docs/getting-started/nodejs).
      ctx.install(["@hono/node-server"]);
      ctx.installDev(["tsx", "typescript", "@types/node"]);
      ctx.addFile(
        "src/index.ts",
        `import { serve } from "@hono/node-server";
import { Hono } from "hono";

${routes}

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? ${port}) }, (info) => {
  console.log(\`Server listening on http://localhost:\${info.port}\`);
});
`,
      );
      ctx.setScript("dev", "tsx watch src/index.ts");
      ctx.setScript("start", "node --import tsx src/index.ts");
    } else if (runtime === "bun") {
      // Bun serves the default export directly (hono.dev/docs/getting-started/bun).
      ctx.installDev(["@types/bun"]);
      ctx.addFile(
        "src/index.ts",
        `import { Hono } from "hono";

${routes}

export default {
  port: Number(process.env.PORT ?? ${port}),
  fetch: app.fetch,
};
`,
      );
      ctx.setScript("dev", "bun run --hot src/index.ts");
      ctx.setScript("start", "bun run src/index.ts");
      ctx.warn(
        "Run 'bun install' to install dependencies for the Bun runtime.",
      );
    } else {
      // Cloudflare Workers: export the app; wrangler drives dev/deploy.
      ctx.installDev(["wrangler", "@cloudflare/workers-types"]);
      ctx.addFile(
        "src/index.ts",
        `import { Hono } from "hono";

${routes}

export default app;
`,
      );
      ctx.findOrCreate(
        ["wrangler.jsonc", "wrangler.toml"],
        "wrangler.jsonc",
        `{
  "name": "hono-app",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "dev": { "port": ${port} }
}
`,
      );
      ctx.setScript("dev", "wrangler dev");
      ctx.setScript("deploy", "wrangler deploy");
    }
  },
});
