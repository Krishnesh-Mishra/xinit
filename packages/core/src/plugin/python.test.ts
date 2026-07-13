/**
 * End-to-end coverage for XInit operating on a Python project (SPEC §10).
 *
 * A tiny inline plugin (authored via `definePlugin`, packed with `pack`) exercises
 * the Python-facing surface against a `pyproject.toml` + `main.py` fixture:
 *   - `ctx.install(["httpx"])`  → the installer receives `manager: "uv"`
 *   - `ctx.patchToml(...)`      → pyproject is deep-merged, format-preserving
 *   - `ctx.setEnv("X", "1")`    → `.env` is written
 *   - `ctx.ensureLine(ctx.entryFile(), "load_dotenv()")` → line lands in main.py,
 *     proving `entryFile()` resolved the Python entry (not a JS default).
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addPlugin, pack } from "./index.js";
import type { InstallSpec } from "./apply.js";

let work: string;
let pluginDir: string;

const PLUGIN_SRC = `
import { definePlugin } from "@xinit/core";

export default definePlugin({
  name: "py-demo",
  displayName: "Python Demo",
  version: "1.0.0",
  languages: ["python"],
  capabilities: { install: true, exec: false, network: false },
  setup: (ctx) => {
    ctx.install(["httpx"]);
    ctx.patchToml("pyproject.toml", {
      tool: { xinit: { configured: true } },
    });
    ctx.setEnv("X", "1");
    ctx.ensureLine(ctx.entryFile(), "load_dotenv()");
  },
});
`;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-python-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });

  // A uv-managed Python app: pyproject + uv.lock ⇒ manager "uv".
  await fsp.writeFile(
    path.join(work, "pyproject.toml"),
    '[project]\nname = "svc"\nversion = "0.1.0"\ndependencies = ["fastapi"]\n',
  );
  await fsp.writeFile(path.join(work, "uv.lock"), "version = 1\n");
  await fsp.writeFile(
    path.join(work, "main.py"),
    "import os\n\nprint(os.getenv('X'))\n",
  );

  pluginDir = path.join(os.tmpdir(), `xinit-pyplugin-${randomUUID()}`);
  await fsp.mkdir(pluginDir, { recursive: true });
  await fsp.writeFile(path.join(pluginDir, "plugin.ts"), PLUGIN_SRC);
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
  await fsp.rm(pluginDir, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");

describe("addPlugin — Python project end-to-end", () => {
  it("installs with `uv`, patches pyproject, writes .env, and edits main.py", async () => {
    const manifest = await pack(pluginDir);

    let captured: InstallSpec | undefined;
    const installer = async (_dir: string, spec: InstallSpec) => {
      captured = spec;
    };

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");

    // The install was dispatched with the app's detected manager → uv.
    expect(captured?.manager).toBe("uv");
    expect(captured?.deps).toEqual(["httpx"]);
    expect(result.installed).toContain("httpx");

    // pyproject.toml was deep-merged (existing keys preserved).
    const pyproject = read("pyproject.toml");
    expect(pyproject).toContain('name = "svc"');
    expect(pyproject).toContain("[tool.xinit]");
    expect(pyproject).toContain("configured = true");

    // .env written by setEnv.
    expect(read(".env")).toContain("X=1");

    // ensureLine landed in the Python entry — proves entryFile() resolved main.py.
    const mainPy = read("main.py");
    expect(mainPy).toContain("load_dotenv()");
    expect(result.modified).toContain("main.py");
  });
});
