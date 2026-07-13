import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { InstallSpec } from "@xinit/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { IO } from "../lib/io.js";
import { runAdd } from "./add.js";

// packages/cli/src/commands → repo root is four levels up.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const HEROUI_DIR = path.join(REPO_ROOT, "plugins", "heroui");

const VITE_CONFIG =
  'import react from "@vitejs/plugin-react"; import {defineConfig} from "vite"; export default defineConfig({plugins:[react()]})';

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-cli-add-${randomUUID()}`);
  await fsp.mkdir(path.join(work, "src"), { recursive: true });
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

/** Minimal Vite + React + Tailwind v4 single-app project on disk. */
async function makeViteProject(dir: string): Promise<void> {
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

describe("runAdd — CLI wiring with an injected installer", () => {
  it("adds heroui via a mock installer, succeeds, and orders CSS imports", async () => {
    await makeViteProject(work);

    let installCalls = 0;
    let captured: InstallSpec | undefined;
    const installer = async (_dir: string, spec: InstallSpec) => {
      installCalls++;
      captured = spec;
    };

    const result = await runAdd(
      HEROUI_DIR,
      {},
      { io: new IO({ silent: true }), cwd: work, installer },
    );

    // CLI wired the injected installer through core (no network).
    expect(result.status).toBe("success");
    expect(installCalls).toBe(1);
    expect(captured?.deps).toEqual(["@heroui/styles", "@heroui/react"]);
    expect(result.installed).toEqual(
      expect.arrayContaining(["@heroui/styles", "@heroui/react", "@tailwindcss/vite"]),
    );

    // CSS import order is load-bearing: tailwind BEFORE heroui.
    const css = fs.readFileSync(path.join(work, "src", "index.css"), "utf8");
    const tw = css.indexOf('@import "tailwindcss"');
    const hero = css.indexOf('@import "@heroui/styles"');
    expect(tw).toBeGreaterThanOrEqual(0);
    expect(hero).toBeGreaterThan(tw);
  });

  it("reports rolled_back (exit-worthy) when the installer throws", async () => {
    await makeViteProject(work);
    const installer = async () => {
      throw new Error("network down");
    };

    const result = await runAdd(
      HEROUI_DIR,
      {},
      { io: new IO({ silent: true }), cwd: work, installer },
    );

    expect(result.status).toBe("rolled_back");
    expect(result.warnings.join(" ")).toContain("network down");
  });
});
