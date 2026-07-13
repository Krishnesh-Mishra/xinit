import { definePlugin } from "@initup/core";

/**
 * Redis client via ioredis for a Node backend.
 *
 * `ioredis` is the preferred client here: it accepts a `redis://` connection URL
 * directly (`new Redis(process.env.REDIS_URL)`) and ships robust reconnection,
 * Cluster and Sentinel support out of the box.
 *
 * Add-to-existing modifier: installs `ioredis`, drops a shared client at
 * `src/config/redis.ts`, ensures `REDIS_URL` in `.env`, and wires a side-effect
 * import into the backend entry so the connection is established on boot.
 *
 * install-only — no exec, no network.
 */
export default definePlugin({
  name: "redis",
  displayName: "Redis (ioredis)",
  version: "1.0.0",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "ioredis" },
  prompts: [
    {
      id: "url",
      type: "text",
      message: "Redis connection URL?",
      default: "redis://localhost:6379",
    },
  ],
  setup: async (ctx, answers) => {
    const url =
      typeof answers.url === "string" && answers.url.trim() !== ""
        ? answers.url.trim()
        : "redis://localhost:6379";

    ctx.install(["ioredis"]);

    ctx.copy("files/redis.ts", "src/config/redis.ts");

    // Env-aware upsert: preserves an existing REDIS_URL, seeds .env.example.
    ctx.setEnv("REDIS_URL", url, { example: true });

    // Wire a side-effect import into the backend entry (create it if absent),
    // so the client connects on boot.
    const entry = ctx.findOrCreate(
      ["src/server.ts", "src/index.ts"],
      "src/server.ts",
    );
    ctx.ensureImport(entry, { import: "./config/redis" });
  },
});
