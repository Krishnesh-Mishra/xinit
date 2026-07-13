/**
 * Batch-C plugins end-to-end: ws · socketio · redis · docker.
 *
 * Each plugin is packed (folder → distributable manifest) and applied to a fresh
 * temp fixture with a mocked installer (no network). Assertions cover created
 * files, recorded deps, `.env` lines, and templated Dockerfile/compose content.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addPlugin, pack } from "./index.js";
import type { InstallSpec } from "./apply.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PLUGINS = path.join(REPO_ROOT, "plugins");

const WS_DIR = path.join(PLUGINS, "ws");
const SOCKETIO_DIR = path.join(PLUGINS, "socketio");
const REDIS_DIR = path.join(PLUGINS, "redis");
const DOCKER_DIR = path.join(PLUGINS, "docker");

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-c-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

/** A minimal Node backend with a `src/server.ts` entry to wire into. */
async function makeBackendProject(dir: string): Promise<void> {
  await fsp.mkdir(path.join(dir, "src"), { recursive: true });
  await fsp.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "demo", private: true, type: "module", dependencies: {} },
      null,
      2,
    ) + "\n",
  );
  await fsp.writeFile(
    path.join(dir, "src", "server.ts"),
    'import express from "express";\n\nconst app = express();\napp.listen(3000);\n',
  );
}

/** An installer that records the batched InstallSpec and counts invocations. */
function recordingInstaller() {
  const state = { calls: 0, spec: undefined as InstallSpec | undefined };
  const installer = async (_dir: string, spec: InstallSpec) => {
    state.calls++;
    state.spec = spec;
  };
  return { state, installer };
}

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(work, rel));

describe("ws plugin", () => {
  it("installs ws + @types/ws, adds the server file, and wires the entry", async () => {
    await makeBackendProject(work);
    const manifest = await pack(WS_DIR);
    const { state, installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.calls).toBe(1);
    expect(state.spec?.deps).toEqual(["ws"]);
    expect(state.spec?.devDeps).toEqual(["@types/ws"]);
    expect(result.installed).toEqual(
      expect.arrayContaining(["ws", "@types/ws"]),
    );

    expect(exists("src/ws-server.ts")).toBe(true);
    expect(read("src/ws-server.ts")).toContain("WebSocketServer");

    // Side-effect import wired into the existing entry.
    expect(read("src/server.ts")).toContain('import "./ws-server";');

    // Manual-step guidance surfaced.
    expect(result.warnings.join(" ")).toContain("WS_PORT");
  });
});

describe("socketio plugin", () => {
  it("installs socket.io, adds src/socket.ts, and wires the entry (no client by default)", async () => {
    await makeBackendProject(work);
    const manifest = await pack(SOCKETIO_DIR);
    const { state, installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(["socket.io"]);
    expect(result.installed).not.toContain("socket.io-client");

    expect(exists("src/socket.ts")).toBe(true);
    expect(read("src/socket.ts")).toContain("new Server(");
    expect(exists("src/socket-client.ts")).toBe(false);

    expect(read("src/server.ts")).toContain('import "./socket";');
  });

  it("adds the client when answered", async () => {
    await makeBackendProject(work);
    const manifest = await pack(SOCKETIO_DIR);
    const { state, installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      answers: { client: true },
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(
      expect.arrayContaining(["socket.io", "socket.io-client"]),
    );
    expect(exists("src/socket-client.ts")).toBe(true);
    expect(read("src/socket-client.ts")).toContain("socket.io-client");
  });
});

describe("redis plugin", () => {
  it("installs ioredis, adds the client, ensures REDIS_URL, and wires the entry", async () => {
    await makeBackendProject(work);
    const manifest = await pack(REDIS_DIR);
    const { state, installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(["ioredis"]);

    expect(exists("src/config/redis.ts")).toBe(true);
    expect(read("src/config/redis.ts")).toContain('from "ioredis"');

    expect(read(".env")).toContain("REDIS_URL=redis://localhost:6379");
    expect(read("src/server.ts")).toContain('import "./config/redis";');
  });

  it("honors a custom URL answer in .env", async () => {
    await makeBackendProject(work);
    const manifest = await pack(REDIS_DIR);
    const { installer } = recordingInstaller();

    await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      answers: { url: "redis://cache:6380" },
      installer,
    });

    expect(read(".env")).toContain("REDIS_URL=redis://cache:6380");
    expect(read(".env")).not.toContain("localhost:6379");
  });
});

describe("docker plugin", () => {
  it("writes a templated Dockerfile + .dockerignore and installs nothing", async () => {
    await makeBackendProject(work);
    const manifest = await pack(DOCKER_DIR);

    // Pure file plugin: declares no capabilities.
    expect(manifest.capabilities).toEqual({
      install: false,
      exec: false,
      network: false,
    });

    const { state, installer } = recordingInstaller();
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      answers: { port: "3000" },
      installer,
    });

    expect(result.status).toBe("success");
    // No installs recorded → installer never called.
    expect(state.calls).toBe(0);
    expect(result.installed).toEqual([]);

    expect(exists("Dockerfile")).toBe(true);
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("FROM node:20-alpine");
    expect(dockerfile).toContain("EXPOSE 3000");

    expect(exists(".dockerignore")).toBe(true);
    expect(read(".dockerignore")).toContain("node_modules");

    // No compose by default.
    expect(exists("docker-compose.yml")).toBe(false);
  });

  it("generates a port-templated docker-compose.yml when requested", async () => {
    await makeBackendProject(work);
    const manifest = await pack(DOCKER_DIR);
    const { installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      answers: { port: "4000", compose: true },
      installer,
    });

    expect(result.status).toBe("success");
    expect(read("Dockerfile")).toContain("EXPOSE 4000");

    expect(exists("docker-compose.yml")).toBe(true);
    const compose = read("docker-compose.yml");
    expect(compose).toContain('"4000:4000"');
    expect(compose).toContain("build: .");
  });
});
