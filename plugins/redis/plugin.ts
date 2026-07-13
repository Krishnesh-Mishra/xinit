import { definePlugin } from "@initup/core";

/**
 * Redis client — cross-language (JS/TS + Python).
 *
 * Branches on `ctx.language()`:
 * - **ts/js** → `ioredis`, the preferred Node client: it accepts a `redis://`
 *   URL directly (`new Redis(process.env.REDIS_URL)`) and ships robust
 *   reconnection, Cluster and Sentinel support. Drops a shared client at
 *   `src/config/redis.ts` and wires a side-effect import into the backend entry
 *   so the connection is established on boot.
 * - **python** → `redis` (redis-py), with a `redis_client.py` that builds a
 *   client via `redis.from_url(REDIS_URL)`.
 *
 * `ctx.install` auto-dispatches through the app's detected manager (`uv add` for
 * Python, `pnpm add`/… for JS), so the plugin only branches package NAMES and
 * file contents — never the manager.
 *
 * install-only — no exec, no network.
 */
export default definePlugin({
  name: "redis",
  displayName: "Redis",
  version: "1.0.0",
  languages: ["ts", "js", "python"],
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

    if (ctx.language() === "python") {
      // redis-py; `from_url` accepts a `redis://` connection URL directly.
      ctx.install(["redis"]);
      ctx.addFile(
        "redis_client.py",
        `import os

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

# Shared Redis client. Connection-pooled and lazy — connects on first command.
client = redis.from_url(REDIS_URL, decode_responses=True)
`,
      );

      // Env-aware upsert: preserves an existing REDIS_URL, seeds .env.example.
      ctx.setEnv("REDIS_URL", url, { example: true });
      return;
    }

    // --- JS/TS (unchanged) ---
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
