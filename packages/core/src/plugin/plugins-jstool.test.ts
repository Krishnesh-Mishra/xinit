/**
 * JS/TS tooling plugins — end-to-end apply checks (biome, vitest).
 *
 * Each plugin is packed to a distributable manifest, then applied to a fresh
 * temp TS project with an injected installer (no network, no subprocess). Both
 * are install-only, so they are asserted by the real files, dev-deps, and
 * scripts they leave on disk.
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
const BIOME_DIR = path.join(PLUGINS, "biome");
const VITEST_DIR = path.join(PLUGINS, "vitest");

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-jstool-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

/** Minimal Node/TS project on disk (package.json + tsconfig.json ⇒ language ts). */
async function makeTsProject(dir: string): Promise<void> {
  await fsp.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "demo",
        private: true,
        type: "module",
        devDependencies: { typescript: "^5.0.0" },
      },
      null,
      2,
    ) + "\n",
  );
  await fsp.writeFile(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true } }, null, 2) + "\n",
  );
}

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");
const scripts = () =>
  (JSON.parse(read("package.json")) as { scripts?: Record<string, string> })
    .scripts ?? {};

describe("biome plugin — install-only (lint + format)", () => {
  it("installs @biomejs/biome, writes biome.json, wires lint/format scripts", async () => {
    await makeTsProject(work);
    const manifest = await pack(BIOME_DIR);

    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });
    expect(manifest.detect).toEqual({ file: "biome.json" });

    let captured: InstallSpec | undefined;
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async (_dir, spec) => {
        captured = spec;
      },
    });

    expect(result.status).toBe("success");
    expect(captured?.devDeps).toEqual(["@biomejs/biome"]);

    // biome.json created and is valid JSON with formatter + linter enabled.
    expect(fs.existsSync(path.join(work, "biome.json"))).toBe(true);
    const biome = JSON.parse(read("biome.json")) as {
      $schema?: string;
      formatter?: { enabled?: boolean };
      linter?: { enabled?: boolean };
    };
    expect(biome.$schema).toContain("biomejs.dev/schemas");
    expect(biome.formatter?.enabled).toBe(true);
    expect(biome.linter?.enabled).toBe(true);

    expect(scripts().lint).toBe("biome check .");
    expect(scripts().format).toBe("biome format --write .");
  });
});

describe("vitest plugin — install-only (test runner)", () => {
  it("installs vitest, writes vitest.config.ts + a test file, wires the test script", async () => {
    await makeTsProject(work);
    const manifest = await pack(VITEST_DIR);

    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });
    expect(manifest.detect).toEqual({ dependency: "vitest" });

    let captured: InstallSpec | undefined;
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async (_dir, spec) => {
        captured = spec;
      },
    });

    expect(result.status).toBe("success");
    expect(captured?.devDeps).toEqual(["vitest"]);

    // TS project ⇒ .ts config + test file.
    expect(fs.existsSync(path.join(work, "vitest.config.ts"))).toBe(true);
    expect(read("vitest.config.ts")).toContain('from "vitest/config"');

    expect(fs.existsSync(path.join(work, "src/example.test.ts"))).toBe(true);
    const test = read("src/example.test.ts");
    expect(test).toContain('from "vitest"');
    expect(test).toContain("toBe(2)");

    expect(scripts().test).toBe("vitest run");
  });
});
