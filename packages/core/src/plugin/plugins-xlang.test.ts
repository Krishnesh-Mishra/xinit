/**
 * Cross-language plugins: postgres · s3 · redis.
 *
 * Each plugin is packed (folder → distributable manifest) and applied to two
 * fresh fixtures — a JS/TS app and a Python app — with a mocked installer (no
 * network). Assertions prove `ctx.language()` dispatches the right package NAMES
 * and files per stack, and that the app's detected manager rides along on the
 * captured `InstallSpec` (uv for Python, pnpm for JS/TS).
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

const POSTGRES_DIR = path.join(PLUGINS, "postgres");
const S3_DIR = path.join(PLUGINS, "s3");
const REDIS_DIR = path.join(PLUGINS, "redis");

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-xlang-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

// --- fixtures ---------------------------------------------------------------

/** A JS app: package.json + pnpm lockfile (manager ⇒ pnpm), no tsconfig ⇒ js. */
async function makeJsApp(dir: string): Promise<void> {
  await fsp.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "demo", private: true, type: "module", dependencies: {} },
      null,
      2,
    ) + "\n",
  );
  await fsp.writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
}

/** A TS app: JS app + tsconfig.json ⇒ ctx.language() === "ts". */
async function makeTsApp(dir: string): Promise<void> {
  await makeJsApp(dir);
  await fsp.writeFile(path.join(dir, "tsconfig.json"), "{}\n");
}

/** A JS backend with an entry file to wire into. */
async function makeJsBackend(dir: string): Promise<void> {
  await makeJsApp(dir);
  await fsp.mkdir(path.join(dir, "src"), { recursive: true });
  await fsp.writeFile(
    path.join(dir, "src", "server.ts"),
    'import express from "express";\n\nconst app = express();\napp.listen(3000);\n',
  );
}

/** A Python app: pyproject.toml + empty uv.lock (manager ⇒ uv) + main.py. */
async function makePythonApp(dir: string): Promise<void> {
  await fsp.writeFile(
    path.join(dir, "pyproject.toml"),
    '[project]\nname = "demo"\nversion = "0.1.0"\ndependencies = []\n',
  );
  await fsp.writeFile(path.join(dir, "uv.lock"), "");
  await fsp.writeFile(path.join(dir, "main.py"), 'print("hello")\n');
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

describe("postgres plugin (cross-language)", () => {
  it("python → psycopg[binary] via uv, db.py, DATABASE_URL", async () => {
    await makePythonApp(work);
    const manifest = await pack(POSTGRES_DIR);
    const { state, installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(["psycopg[binary]"]);
    expect(state.spec?.devDeps).toEqual([]);
    expect(state.spec?.manager).toBe("uv");

    expect(exists("db.py")).toBe(true);
    expect(read("db.py")).toContain("psycopg.connect(DATABASE_URL)");
    // No JS artifacts leaked into the Python app.
    expect(exists("src/db.ts")).toBe(false);

    expect(read(".env")).toContain(
      "DATABASE_URL=postgres://postgres:postgres@localhost:5432/app",
    );
  });

  it("ts → pg + @types/pg via pnpm, src/db.ts, DATABASE_URL", async () => {
    await makeTsApp(work);
    const manifest = await pack(POSTGRES_DIR);
    const { state, installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(["pg"]);
    expect(state.spec?.devDeps).toEqual(["@types/pg"]);
    expect(state.spec?.manager).toBe("pnpm");

    expect(exists("src/db.ts")).toBe(true);
    expect(read("src/db.ts")).toContain('from "pg"');
    expect(exists("db.py")).toBe(false);

    expect(read(".env")).toContain("DATABASE_URL=");
  });
});

describe("s3 plugin (cross-language)", () => {
  it("python → boto3 via uv, s3.py, env vars", async () => {
    await makePythonApp(work);
    const manifest = await pack(S3_DIR);
    const { state, installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(["boto3"]);
    expect(state.spec?.manager).toBe("uv");

    expect(exists("s3.py")).toBe(true);
    expect(read("s3.py")).toContain('boto3.client("s3"');
    expect(exists("src/s3.ts")).toBe(false);

    const env = read(".env");
    expect(env).toContain("AWS_REGION=");
    expect(env).toContain("S3_BUCKET=");
  });

  it("js → @aws-sdk/client-s3 via pnpm, src/s3.js", async () => {
    await makeJsApp(work);
    const manifest = await pack(S3_DIR);
    const { state, installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(["@aws-sdk/client-s3"]);
    expect(state.spec?.manager).toBe("pnpm");

    expect(exists("src/s3.js")).toBe(true);
    expect(read("src/s3.js")).toContain("S3Client");
    expect(exists("s3.py")).toBe(false);
  });
});

describe("redis plugin (cross-language)", () => {
  it("python → redis via uv, redis_client.py, REDIS_URL", async () => {
    await makePythonApp(work);
    const manifest = await pack(REDIS_DIR);
    const { state, installer } = recordingInstaller();

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(["redis"]);
    expect(state.spec?.manager).toBe("uv");

    expect(exists("redis_client.py")).toBe(true);
    expect(read("redis_client.py")).toContain("redis.from_url(REDIS_URL");
    // Python path never creates the Node client.
    expect(exists("src/config/redis.ts")).toBe(false);

    expect(read(".env")).toContain("REDIS_URL=redis://localhost:6379");
  });

  it("js backend → ioredis + src/config/redis.ts (unchanged)", async () => {
    await makeJsBackend(work);
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
    expect(exists("redis_client.py")).toBe(false);

    expect(read(".env")).toContain("REDIS_URL=redis://localhost:6379");
    expect(read("src/server.ts")).toContain('import "./config/redis";');
  });
});
