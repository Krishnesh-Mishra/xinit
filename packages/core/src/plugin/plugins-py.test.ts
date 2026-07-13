/**
 * Batch Python plugins — the four Python-targeting plugins (uv, python-dotenv,
 * ruff, fastapi) exercised end-to-end against a real uv-managed Python fixture.
 *
 * Each test packs the actual authored plugin folder (`plugins/<name>`), runs it
 * with `addPlugin` against a temp `pyproject.toml` + `uv.lock` + `main.py`
 * fixture, and captures the `InstallSpec` with a mock installer (no network).
 * The key cross-cutting assertion: `ctx.install`/`installDev` dispatches with
 * `manager: "uv"` — proving the manager is detected from the app (`uv.lock`) and
 * the plugin never special-cases it. NOTE: the fixture has NO `package.json`, or
 * a JS manager would win over uv (see detect/manager.ts).
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

// This file lives at packages/core/src/plugin/*.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PLUGINS = path.join(REPO_ROOT, "plugins");

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-plugins-py-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });

  // A uv-managed Python app: pyproject + (empty-ish) uv.lock ⇒ manager "uv".
  // Crucially NO package.json (that would make the detected manager npm).
  await fsp.writeFile(
    path.join(work, "pyproject.toml"),
    '[project]\nname = "svc"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = []\n',
  );
  await fsp.writeFile(path.join(work, "uv.lock"), "");
  await fsp.writeFile(path.join(work, "main.py"), 'print("hi")\n');
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");

/** Run a packed plugin against the fixture, capturing the install spec. */
async function run(name: string, answers?: Record<string, unknown>) {
  const manifest = await pack(path.join(PLUGINS, name));
  let spec: InstallSpec | undefined;
  const result = await addPlugin({
    pluginDirOrManifest: manifest,
    appDir: work,
    answers,
    installer: async (_dir, s) => {
      spec = s;
    },
  });
  return { manifest, result, spec };
}

describe("uv plugin", () => {
  it("writes pyproject/.python-version/.gitignore and installs nothing", async () => {
    const { manifest, result, spec } = await run("uv");

    expect(manifest.name).toBe("uv");
    expect(manifest.languages).toEqual(["python"]);
    expect(manifest.appliesTo).toEqual({ type: "new-app" });
    // Honest capabilities: it only writes files.
    expect(manifest.capabilities).toEqual({
      install: false,
      exec: false,
      network: false,
    });

    expect(result.status).toBe("success");

    // pyproject present (pre-existing, left intact by findOrCreate).
    expect(fs.existsSync(path.join(work, "pyproject.toml"))).toBe(true);
    expect(read("pyproject.toml")).toContain('name = "svc"');

    // .python-version pinned to the prompt default (3.12).
    expect(read(".python-version")).toBe("3.12\n");

    // Python .gitignore written.
    const gitignore = read(".gitignore");
    expect(gitignore).toContain("__pycache__/");
    expect(gitignore).toContain(".venv/");
    expect(gitignore).toContain(".env");

    // Manual "uv sync" step surfaced; installs nothing.
    expect(result.warnings.some((w) => w.includes("uv sync"))).toBe(true);
    expect(spec).toBeUndefined();
    expect(result.installed).toEqual([]);
  });
});

describe("python-dotenv plugin", () => {
  it("installs via uv, seeds .env, and wires load_dotenv into the entry", async () => {
    const { manifest, result, spec } = await run("python-dotenv");

    expect(manifest.name).toBe("python-dotenv");
    expect(manifest.languages).toEqual(["python"]);
    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });

    expect(result.status).toBe("success");

    // ctx.install dispatched with the app's detected manager → uv.
    expect(spec?.manager).toBe("uv");
    expect(spec?.deps).toEqual(["python-dotenv"]);
    expect(result.installed).toContain("python-dotenv");

    // .env + .env.example seeded.
    expect(read(".env")).toContain("APP_ENV=development");
    expect(read(".env.example")).toContain("APP_ENV=development");

    // Entry (main.py) gains the import THEN the call, in that order.
    const mainPy = read("main.py");
    expect(mainPy).toContain("from dotenv import load_dotenv");
    expect(mainPy).toContain("load_dotenv()");
    expect(mainPy.indexOf("from dotenv import load_dotenv")).toBeLessThan(
      mainPy.indexOf("load_dotenv()"),
    );
    expect(result.modified).toContain("main.py");
  });
});

describe("ruff plugin", () => {
  it("dev-installs ruff via uv and configures [tool.ruff] in pyproject", async () => {
    const { manifest, result, spec } = await run("ruff");

    expect(manifest.name).toBe("ruff");
    expect(manifest.languages).toEqual(["python"]);
    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });

    expect(result.status).toBe("success");

    // Dev install through the uv manager.
    expect(spec?.manager).toBe("uv");
    expect(spec?.devDeps).toEqual(["ruff"]);
    expect(result.installed).toContain("ruff");

    // pyproject deep-merged with a [tool.ruff] block (existing keys preserved).
    const pyproject = read("pyproject.toml");
    expect(pyproject).toContain('name = "svc"');
    expect(pyproject).toContain("[tool.ruff]");
    expect(pyproject).toContain("line-length = 100");
    expect(pyproject).toContain("[tool.ruff.lint]");
    expect(pyproject).toMatch(/select = \[\s*"E",\s*"F",\s*"I",?\s*\]/);
  });
});

describe("fastapi plugin", () => {
  it("installs fastapi[standard] via uv and writes a FastAPI app", async () => {
    const { manifest, result, spec } = await run("fastapi");

    expect(manifest.name).toBe("fastapi");
    expect(manifest.languages).toEqual(["python"]);
    expect(manifest.appliesTo).toEqual({ framework: "fastapi" });
    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });

    expect(result.status).toBe("success");

    // Install through the uv manager; fastapi[standard] bundles uvicorn.
    expect(spec?.manager).toBe("uv");
    expect(spec?.deps).toContain("fastapi[standard]");
    expect(result.installed).toContain("fastapi[standard]");

    // main.py contains a FastAPI app with a GET "/" route.
    const mainPy = read("main.py");
    expect(mainPy).toContain("from fastapi import FastAPI");
    expect(mainPy).toContain("app = FastAPI()");
    expect(mainPy).toContain('@app.get("/")');
    expect(result.modified).toContain("main.py");

    // Manual "start the server" step surfaced.
    expect(result.warnings.some((w) => w.includes("uvicorn main:app"))).toBe(
      true,
    );
  });
});
