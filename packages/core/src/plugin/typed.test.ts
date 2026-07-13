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
const HEROUI_TS = path.join(REPO_ROOT, "plugins", "heroui", "plugin.ts");

const VITE_CONFIG =
  'import react from "@vitejs/plugin-react"; import {defineConfig} from "vite"; export default defineConfig({plugins:[react()]})';

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-typed-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

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

describe("typed plugin — make + addPlugin end-to-end", () => {
  it("packs the typed heroui plugin.ts and applies it (tailwind before heroui)", async () => {
    await makeViteProject(work);

    // `xinit make` packs a typed `plugin.ts` FILE → distributable manifest whose
    // `setup` is the bundled definition OBJECT (not a bare function).
    const manifest = await pack(HEROUI_TS);
    expect(manifest.name).toBe("heroui");
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });
    expect(manifest.dependsOn).toEqual(["tailwind-v4"]);
    // The bundled setup default-exports an object with `.setup` (definition form).
    expect(manifest.setup).toContain("__toCommonJS");

    let captured: InstallSpec | undefined;
    const installer = async (_dir: string, spec: InstallSpec) => {
      captured = spec;
    };

    // Apply the PACKED manifest (exercises loadPluginPacked → shim → resolveSetupFn).
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(captured?.deps).toEqual(["@heroui/styles", "@heroui/react"]);
    expect(result.installed).toEqual(
      expect.arrayContaining([
        "@heroui/styles",
        "@heroui/react",
        "@tailwindcss/vite",
      ]),
    );

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

describe("ctx.warn — manual steps surface in ApplyResult.warnings", () => {
  it("a typed plugin that warns reports the message on success", async () => {
    // A typed plugin authored against the `xinit` SDK id (external + shimmed).
    const pluginDir = path.join(work, "warnly");
    await fsp.mkdir(pluginDir, { recursive: true });
    await fsp.writeFile(
      path.join(pluginDir, "plugin.ts"),
      `import { definePlugin } from "xinit";
export default definePlugin({
  name: "warnly",
  displayName: "Warnly",
  capabilities: { install: true, exec: false, network: false },
  setup: async (ctx) => {
    ctx.install(["left-pad"]);
    ctx.warn("Wrap your app in <Provider> — this step is manual.");
  },
});
`,
    );

    const appDir = path.join(work, "app");
    await fsp.mkdir(appDir, { recursive: true });
    await fsp.writeFile(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "demo", type: "module" }, null, 2),
    );

    const result = await addPlugin({
      pluginDirOrManifest: pluginDir,
      appDir,
      installer: async () => {},
    });

    expect(result.status).toBe("success");
    expect(result.warnings).toContain(
      "Wrap your app in <Provider> — this step is manual.",
    );
  });
});
