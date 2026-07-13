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

// Repo root: this file lives at packages/core/src/plugin/*.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PLUGINS = path.join(REPO_ROOT, "plugins");
const HEROUI_DIR = path.join(PLUGINS, "heroui");
const SHADCN_DIR = path.join(PLUGINS, "shadcn");

const VITE_CONFIG =
  'import react from "@vitejs/plugin-react"; import {defineConfig} from "vite"; export default defineConfig({plugins:[react()]})';

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-m3-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

/** Minimal Vite + React + Tailwind v4 project on disk. */
async function makeViteProject(dir: string): Promise<void> {
  await fsp.mkdir(path.join(dir, "src"), { recursive: true });
  await fsp.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "demo",
        private: true,
        type: "module",
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: { vite: "^6.0.0", tailwindcss: "^4.0.0" },
      },
      null,
      2,
    ) + "\n",
  );
  await fsp.writeFile(path.join(dir, "vite.config.ts"), VITE_CONFIG);
  await fsp.writeFile(path.join(dir, "src", "index.css"), "");
}

describe("addPlugin — HeroUI end-to-end", () => {
  it("installs deps, patches vite config, and orders CSS imports correctly", async () => {
    await makeViteProject(work);

    let installCalls = 0;
    let captured: InstallSpec | undefined;
    const installer = async (_dir: string, spec: InstallSpec) => {
      installCalls++;
      captured = spec;
    };

    const result = await addPlugin({
      pluginDirOrManifest: HEROUI_DIR,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");

    // installs — prod + dev captured, installer invoked exactly once.
    expect(installCalls).toBe(1);
    expect(captured?.deps).toEqual(["@heroui/styles", "@heroui/react"]);
    expect(captured?.devDeps).toContain("@tailwindcss/vite");
    expect(result.installed).toEqual(
      expect.arrayContaining([
        "@heroui/styles",
        "@heroui/react",
        "@tailwindcss/vite",
      ]),
    );

    // vite.config.ts gained the tailwind plugin import + call.
    const vite = fs.readFileSync(path.join(work, "vite.config.ts"), "utf8");
    expect(vite).toContain("@tailwindcss/vite");
    expect(vite).toContain("tailwindcss()");

    // CSS import order is load-bearing: tailwind BEFORE heroui.
    const css = fs.readFileSync(path.join(work, "src", "index.css"), "utf8");
    const tw = css.indexOf('@import "tailwindcss"');
    const hero = css.indexOf('@import "@heroui/styles"');
    expect(tw).toBeGreaterThanOrEqual(0);
    expect(hero).toBeGreaterThan(tw);
  });
});

describe("addPlugin — idempotency", () => {
  it("a second run is a no-op with byte-identical files", async () => {
    await makeViteProject(work);
    const installer = async () => {};

    await addPlugin({ pluginDirOrManifest: HEROUI_DIR, appDir: work, installer });

    const viteAfter1 = fs.readFileSync(path.join(work, "vite.config.ts"), "utf8");
    const cssAfter1 = fs.readFileSync(path.join(work, "src", "index.css"), "utf8");

    const second = await addPlugin({
      pluginDirOrManifest: HEROUI_DIR,
      appDir: work,
      installer,
    });

    expect(second.status).toBe("success");
    // No file steps remained → nothing created or modified on the re-run.
    expect(second.created).toEqual([]);
    expect(second.modified).toEqual([]);

    const viteAfter2 = fs.readFileSync(path.join(work, "vite.config.ts"), "utf8");
    const cssAfter2 = fs.readFileSync(path.join(work, "src", "index.css"), "utf8");
    expect(viteAfter2).toBe(viteAfter1);
    expect(cssAfter2).toBe(cssAfter1);

    // No duplicated imports.
    expect(cssAfter2.match(/@import "@heroui\/styles"/g)?.length).toBe(1);
    expect(cssAfter2.match(/@import "tailwindcss"/g)?.length).toBe(1);
  });
});

describe("addPlugin — rollback", () => {
  it("restores pre-apply file bytes when installer throws", async () => {
    await makeViteProject(work);

    const viteBefore = fs.readFileSync(path.join(work, "vite.config.ts"), "utf8");
    const cssBefore = fs.readFileSync(path.join(work, "src", "index.css"), "utf8");

    const installer = async () => {
      throw new Error("network down");
    };

    const result = await addPlugin({
      pluginDirOrManifest: HEROUI_DIR,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("rolled_back");
    expect(result.warnings.join(" ")).toContain("network down");

    const viteAfter = fs.readFileSync(path.join(work, "vite.config.ts"), "utf8");
    const cssAfter = fs.readFileSync(path.join(work, "src", "index.css"), "utf8");
    expect(viteAfter).toBe(viteBefore);
    expect(cssAfter).toBe(cssBefore);
  });
});

describe("addPlugin — consent handshake", () => {
  it("returns confirmation_required with a token for a third-party exec plugin", async () => {
    // shadcn patches tsconfig + vite config and runs npx (exec + network).
    await fsp.writeFile(
      path.join(work, "package.json"),
      JSON.stringify({ name: "demo", type: "module" }, null, 2),
    );
    await fsp.writeFile(path.join(work, "vite.config.ts"), VITE_CONFIG);
    await fsp.writeFile(
      path.join(work, "tsconfig.json"),
      JSON.stringify({ compilerOptions: {} }, null, 2),
    );

    const manifest = await pack(SHADCN_DIR);

    let installerCalled = false;
    let runnerCalled = false;

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      trust: "third-party",
      installer: async () => {
        installerCalled = true;
      },
      runner: async () => {
        runnerCalled = true;
      },
    });

    expect(result.status).toBe("confirmation_required");
    expect(typeof result.confirmToken).toBe("string");
    expect(result.confirmToken).not.toBe("");
    expect(result.plan?.commands).toContain("npx shadcn@latest init -d");

    // Nothing ran — consent gate held.
    expect(installerCalled).toBe(false);
    expect(runnerCalled).toBe(false);
    expect(fs.existsSync(path.join(work, "components.json"))).toBe(false);
  });
});
