/**
 * End-to-end coverage for `ctx.setEnv` — the env-aware upsert primitive — via
 * pack() + addPlugin() over the `redis` plugin (which calls
 * `ctx.setEnv("REDIS_URL", url, { example: true })`). Verifies the never-overwrite
 * rule and `.env.example` seeding against real disk.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addPlugin, pack } from "./index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const REDIS_DIR = path.join(REPO_ROOT, "plugins", "redis");

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-setenv-${randomUUID()}`);
  await fsp.mkdir(path.join(work, "src"), { recursive: true });
  await fsp.writeFile(
    path.join(work, "package.json"),
    JSON.stringify({ name: "demo", type: "module", dependencies: {} }, null, 2) +
      "\n",
  );
  await fsp.writeFile(
    path.join(work, "src", "server.ts"),
    'import express from "express";\nconst app = express();\napp.listen(3000);\n',
  );
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(work, rel));

describe("ctx.setEnv end-to-end (redis)", () => {
  it("creates .env and seeds .env.example when both are absent", async () => {
    const manifest = await pack(REDIS_DIR);
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
    });

    expect(result.status).toBe("success");
    expect(read(".env")).toContain("REDIS_URL=redis://localhost:6379");
    // `example: true` seeds a committed template with the same value.
    expect(exists(".env.example")).toBe(true);
    expect(read(".env.example")).toContain("REDIS_URL=redis://localhost:6379");
  });

  it("NEVER overwrites an existing non-empty value in .env", async () => {
    // A developer already set a custom URL — setEnv must preserve it.
    await fsp.writeFile(
      path.join(work, ".env"),
      "REDIS_URL=redis://custom-host:6390\n",
    );

    const manifest = await pack(REDIS_DIR);
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
    });

    expect(result.status).toBe("success");
    expect(read(".env")).toContain("REDIS_URL=redis://custom-host:6390");
    expect(read(".env")).not.toContain("localhost:6379");
    // The example template is still seeded with the plugin default.
    expect(read(".env.example")).toContain("REDIS_URL=redis://localhost:6379");
  });

  it("fills in a present-but-empty value (REDIS_URL=)", async () => {
    await fsp.writeFile(path.join(work, ".env"), "REDIS_URL=\n");

    const manifest = await pack(REDIS_DIR);
    await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
    });

    expect(read(".env")).toContain("REDIS_URL=redis://localhost:6379");
  });

  it("is idempotent — a second apply leaves .env untouched", async () => {
    const manifest = await pack(REDIS_DIR);
    await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
    });
    const envAfter1 = read(".env");

    const second = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
    });
    expect(second.status).toBe("success");
    expect(read(".env")).toBe(envAfter1);
  });
});
