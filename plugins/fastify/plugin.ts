import { definePlugin } from "@initup/core";

/**
 * Fastify + TypeScript (tsx) backend.
 *
 * Fully deterministic, install-only: it installs Fastify + a TypeScript dev
 * toolchain, writes a typed server, and wires a `dev` script. No exec, no
 * network — every effect is a recorded, reversible write (SPEC §5).
 *
 * The `port` answer is interpolated into the generated server via `ctx.addFile`
 * (computation is free; only the write is recorded into the Plan).
 */
export default definePlugin({
  name: "fastify",
  displayName: "Fastify",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "fastify" },
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

    ctx.install(["fastify"]);
    ctx.installDev(["tsx", "typescript", "@types/node"]);

    // Reuse an existing server entry if present; otherwise create src/server.ts.
    const entry = ctx.findOrCreate(
      ["src/server.ts", "src/index.ts"],
      "src/server.ts",
    );

    ctx.addFile(
      entry,
      `import Fastify from "fastify";

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT ?? ${port});

app.get("/", async () => {
  return { status: "ok" };
});

app.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(\`Server listening on \${address}\`);
});
`,
    );

    ctx.setScript("dev", `tsx watch ${entry}`);
    ctx.setScript("start", `node --import tsx ${entry}`);
  },
});
