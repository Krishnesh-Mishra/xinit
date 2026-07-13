/**
 * Batch D plugins — end-to-end pack + addPlugin over a minimal Vite React app.
 *
 * Each case: build a fresh Vite + React fixture on disk, `pack` the authored
 * plugin folder into a distributable manifest, then `addPlugin` with a mock
 * installer (no network). Assertions verify deps are recorded and the deferred
 * writes land: config/CSS patches, provider wrapping + imports, and new files.
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

// This file lives at packages/core/src/plugin/*.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PLUGINS = path.join(REPO_ROOT, "plugins");

const VITE_CONFIG =
  'import react from "@vitejs/plugin-react"; import {defineConfig} from "vite"; export default defineConfig({plugins:[react()]})';
const MAIN_TSX =
  'import {createRoot} from "react-dom/client"; import App from "./App"; createRoot(document.getElementById("root")!).render(<App/>)';

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-plugins-d-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

/** A minimal Vite + React + TS fixture (package.json, vite config, entry, css). */
async function makeViteReactApp(dir: string): Promise<void> {
  await fsp.mkdir(path.join(dir, "src"), { recursive: true });
  await fsp.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "demo",
        private: true,
        type: "module",
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: { vite: "^6.0.0", typescript: "^5.0.0" },
      },
      null,
      2,
    ) + "\n",
  );
  await fsp.writeFile(path.join(dir, "vite.config.ts"), VITE_CONFIG);
  await fsp.writeFile(path.join(dir, "src", "main.tsx"), MAIN_TSX);
  await fsp.writeFile(path.join(dir, "src", "index.css"), "");
}

/** Pack a plugin folder and apply it; return the result plus captured install. */
async function apply(pluginName: string): Promise<{
  result: Awaited<ReturnType<typeof addPlugin>>;
  install: InstallSpec | undefined;
}> {
  const manifest = await pack(path.join(PLUGINS, pluginName));
  let install: InstallSpec | undefined;
  const result = await addPlugin({
    pluginDirOrManifest: manifest,
    appDir: work,
    installer: async (_dir, spec) => {
      install = spec;
    },
  });
  return { result, install };
}

const read = (rel: string): string =>
  fs.readFileSync(path.join(work, ...rel.split("/")), "utf8");

describe("tailwind-v4", () => {
  it("installs dev deps, patches vite, and imports tailwind in CSS", async () => {
    await makeViteReactApp(work);
    const { result, install } = await apply("tailwind-v4");

    expect(result.status).toBe("success");
    expect(install?.devDeps).toEqual(
      expect.arrayContaining(["tailwindcss", "@tailwindcss/vite"]),
    );

    const vite = read("vite.config.ts");
    expect(vite).toContain("@tailwindcss/vite");
    expect(vite).toContain("tailwindcss()");

    expect(read("src/index.css")).toContain('@import "tailwindcss";');
  });
});

describe("mui", () => {
  it("installs deps, adds theme, and wraps the entry in ThemeProvider", async () => {
    await makeViteReactApp(work);
    const { result, install } = await apply("mui");

    expect(result.status).toBe("success");
    expect(install?.deps).toEqual(
      expect.arrayContaining([
        "@mui/material",
        "@emotion/react",
        "@emotion/styled",
      ]),
    );

    expect(fs.existsSync(path.join(work, "src", "theme.ts"))).toBe(true);

    const main = read("src/main.tsx");
    expect(main).toContain("<ThemeProvider");
    expect(main).toContain("CssBaseline");
    expect(main).toMatch(
      /import\s+\{[^}]*ThemeProvider[^}]*\}\s+from\s+"@mui\/material\/styles"/,
    );
    // The theme prop's binding was added.
    expect(main).toMatch(/import\s+theme\s+from\s+"\.\/theme"/);
    expect(main).toContain("theme={theme}");
  });
});

describe("chakra", () => {
  it("installs v3 deps and wraps the entry in ChakraProvider", async () => {
    await makeViteReactApp(work);
    const { result, install } = await apply("chakra");

    expect(result.status).toBe("success");
    expect(install?.deps).toEqual(
      expect.arrayContaining(["@chakra-ui/react", "@emotion/react"]),
    );

    const main = read("src/main.tsx");
    expect(main).toContain("<ChakraProvider");
    expect(main).toMatch(
      /import\s+\{[^}]*ChakraProvider[^}]*\}\s+from\s+"@chakra-ui\/react"/,
    );
    expect(main).toContain("value={defaultSystem}");
    expect(main).toMatch(/import\s+\{[^}]*defaultSystem[^}]*\}\s+from\s+"@chakra-ui\/react"/);
  });
});

describe("zustand", () => {
  it("installs zustand and creates a starter store", async () => {
    await makeViteReactApp(work);
    const { result, install } = await apply("zustand");

    expect(result.status).toBe("success");
    expect(install?.deps).toEqual(expect.arrayContaining(["zustand"]));

    expect(fs.existsSync(path.join(work, "src", "store.ts"))).toBe(true);
    const store = read("src/store.ts");
    expect(store).toContain('import { create } from "zustand"');
    expect(store).toContain("useCounterStore");

    // No entry wrap for zustand — the entry is untouched.
    expect(read("src/main.tsx")).toBe(MAIN_TSX);
  });
});

describe("tanstack-query", () => {
  it("installs the client, adds queryClient, and wraps the entry", async () => {
    await makeViteReactApp(work);
    const { result, install } = await apply("tanstack-query");

    expect(result.status).toBe("success");
    expect(install?.deps).toEqual(
      expect.arrayContaining(["@tanstack/react-query"]),
    );

    expect(fs.existsSync(path.join(work, "src", "lib", "queryClient.ts"))).toBe(
      true,
    );

    const main = read("src/main.tsx");
    expect(main).toContain("<QueryClientProvider");
    expect(main).toMatch(
      /import\s+\{[^}]*QueryClientProvider[^}]*\}\s+from\s+"@tanstack\/react-query"/,
    );
    expect(main).toContain("client={queryClient}");
    expect(main).toMatch(
      /import\s+\{[^}]*queryClient[^}]*\}\s+from\s+"\.\/lib\/queryClient"/,
    );
  });
});
