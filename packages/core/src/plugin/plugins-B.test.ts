/**
 * Batch B backend plugins — end-to-end apply checks (nestjs, fastify, hono, bun).
 *
 * Each plugin is packed to a distributable manifest, then applied to a fresh
 * temp project with an injected installer/runner (no network, no subprocess).
 * Install-only plugins are asserted by the real files/deps/scripts they leave on
 * disk; the exec plugin (nestjs) is asserted by the command in the plan/runner.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addPlugin } from "./index.js";
import { pack } from "./pack.js";
import type { InstallSpec } from "./apply.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PLUGINS = path.join(REPO_ROOT, "plugins");
const NESTJS_DIR = path.join(PLUGINS, "nestjs");
const FASTIFY_DIR = path.join(PLUGINS, "fastify");
const HONO_DIR = path.join(PLUGINS, "hono");
const BUN_DIR = path.join(PLUGINS, "bun");

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-plugB-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

/** Minimal Node/TS project on disk (package.json is required for setScript). */
async function makeNodeProject(dir: string): Promise<void> {
  await fsp.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "demo", private: true, type: "module", devDependencies: { typescript: "^5.0.0" } },
      null,
      2,
    ) + "\n",
  );
}

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");
const scripts = () =>
  (JSON.parse(read("package.json")) as { scripts?: Record<string, string> })
    .scripts ?? {};

describe("nestjs plugin — CLI (exec)", () => {
  it("plans the `nest new` command and runs it via the injected runner", async () => {
    await makeNodeProject(work);
    const manifest = await pack(NESTJS_DIR);

    expect(manifest.capabilities).toEqual({
      install: true,
      exec: true,
      network: true,
    });

    const ranCommands: string[] = [];
    let installerCalled = false;

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {
        installerCalled = true;
      },
      runner: async (_dir, cmd) => {
        ranCommands.push(cmd);
      },
    });

    expect(result.status).toBe("success");
    const nestCmd = "npx @nestjs/cli new . --skip-git --strict --package-manager pnpm";
    // The scaffold command is both in the plan/result and passed to the runner.
    expect(result.commands).toContain(nestCmd);
    expect(ranCommands).toContain(nestCmd);
    // Nest's CLI installs its own deps — the plugin never calls ctx.install.
    expect(installerCalled).toBe(false);
  });
});

describe("fastify plugin — install-only", () => {
  it("installs fastify + toolchain, writes the server, and wires scripts", async () => {
    await makeNodeProject(work);
    const manifest = await pack(FASTIFY_DIR);

    expect(manifest.capabilities.exec).toBe(false);
    expect(manifest.capabilities.network).toBe(false);

    let captured: InstallSpec | undefined;
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async (_dir, spec) => {
        captured = spec;
      },
    });

    expect(result.status).toBe("success");
    expect(captured?.deps).toEqual(["fastify"]);
    expect(captured?.devDeps).toEqual(
      expect.arrayContaining(["tsx", "typescript", "@types/node"]),
    );

    const server = read("src/server.ts");
    expect(server).toContain('import Fastify from "fastify"');
    expect(server).toContain("app.listen({ port: PORT");
    expect(server).toContain("?? 3000");

    expect(scripts().dev).toBe("tsx watch src/server.ts");
  });
});

describe("hono plugin — install-only (node adapter default)", () => {
  it("installs hono + node-server, writes serve() entry, and wires dev script", async () => {
    await makeNodeProject(work);
    const manifest = await pack(HONO_DIR);

    let captured: InstallSpec | undefined;
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async (_dir, spec) => {
        captured = spec;
      },
    });

    expect(result.status).toBe("success");
    // Default runtime answer is "node".
    expect(captured?.deps).toEqual(
      expect.arrayContaining(["hono", "@hono/node-server"]),
    );

    const index = read("src/index.ts");
    expect(index).toContain('from "@hono/node-server"');
    expect(index).toContain("serve({ fetch: app.fetch");
    expect(index).toContain('c.json({ status: "ok" })');

    expect(scripts().dev).toBe("tsx watch src/index.ts");
  });
});

describe("bun plugin — files only (no install, no exec)", () => {
  it("writes a Bun.serve entry + tsconfig, wires scripts, and warns to bun install", async () => {
    await makeNodeProject(work);
    const manifest = await pack(BUN_DIR);

    expect(manifest.capabilities).toEqual({
      install: false,
      exec: false,
      network: false,
    });

    let installerCalled = false;
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {
        installerCalled = true;
      },
    });

    expect(result.status).toBe("success");
    expect(installerCalled).toBe(false);
    expect(result.installed).toEqual([]);

    const index = read("src/index.ts");
    expect(index).toContain("Bun.serve({");
    expect(index).toContain("?? 3000");

    // A tsconfig.json was created (project had none).
    expect(fs.existsSync(path.join(work, "tsconfig.json"))).toBe(true);

    expect(scripts().dev).toBe("bun --watch src/index.ts");
    expect(result.warnings.join(" ")).toContain("bun install");
  });
});
