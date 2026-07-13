/**
 * End-to-end tests for Feature 2 (ctx.wrap) and Feature 3 (resolvers), driven
 * through addPlugin on a temp project with a packed manifest whose `setup` is a
 * hand-written CJS bundle (the same shape loadPluginPacked expects).
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addPlugin } from "./index.js";
import { RecordingCtx } from "./ctx.js";
import type { PluginManifest } from "../types.js";

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-wrap-${randomUUID()}`);
  await fsp.mkdir(path.join(work, "src"), { recursive: true });
});
afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

/** A packed manifest whose setup body is `fnBody` (receives ctx, answers). */
function packedManifest(fnBody: string): PluginManifest {
  return {
    schemaVersion: 1,
    name: "wraptest",
    displayName: "Wrap Test",
    capabilities: { install: false, exec: false, network: false },
    setup: `module.exports.default = async function(ctx, answers){\n${fnBody}\n};`,
  };
}

const MAIN = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

describe("ctx.wrap — end-to-end via addPlugin", () => {
  it("wraps the render site and adds the import", async () => {
    await fsp.writeFile(path.join(work, "src", "main.tsx"), MAIN);
    await fsp.writeFile(
      path.join(work, "package.json"),
      JSON.stringify({ name: "demo", type: "module" }, null, 2),
    );

    const manifest = packedManifest(
      `ctx.wrap("src/main.tsx", { component: "HeroUIProvider", from: "@heroui/react" });`,
    );

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
    });

    expect(result.status).toBe("success");
    expect(result.modified).toContain("src/main.tsx");

    const out = fs.readFileSync(path.join(work, "src", "main.tsx"), "utf8");
    expect(out).toContain("<HeroUIProvider>");
    expect(out).toContain("</HeroUIProvider>");
    expect(out).toMatch(/import\s+\{\s*HeroUIProvider\s*\}\s+from\s+"@heroui\/react"/);
    expect(out).toContain("<StrictMode>");
  });

  it("surfaces a warning (no corruption) when the target is unresolvable", async () => {
    const util = "export const add = (a, b) => a + b;\n";
    await fsp.writeFile(path.join(work, "src", "util.ts"), util);
    await fsp.writeFile(
      path.join(work, "package.json"),
      JSON.stringify({ name: "demo", type: "module" }, null, 2),
    );

    const manifest = packedManifest(
      `ctx.wrap("src/util.ts", { component: "Provider", from: "lib" });`,
    );

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
    });

    expect(result.status).toBe("success");
    expect(result.warnings.join(" ")).toMatch(/Could not auto-wrap src\/util\.ts/);
    // File untouched.
    expect(fs.readFileSync(path.join(work, "src", "util.ts"), "utf8")).toBe(util);
  });
});

describe("ctx resolvers", () => {
  function ctxFor(dir: string): RecordingCtx {
    return new RecordingCtx({
      appDir: dir,
      repoRoot: dir,
      answers: {},
      prompter: async (p) => p.default,
      file: () => "",
      capabilities: { install: false, exec: false, network: false },
    });
  }

  it("entryFile finds src/main.tsx", async () => {
    await fsp.writeFile(path.join(work, "src", "main.tsx"), MAIN);
    await fsp.writeFile(
      path.join(work, "package.json"),
      JSON.stringify({ name: "demo" }, null, 2),
    );
    expect(ctxFor(work).entryFile()).toBe("src/main.tsx");
  });

  it("stylesheet finds a css imported by the entry", async () => {
    await fsp.writeFile(
      path.join(work, "src", "main.tsx"),
      `import "./styles/app.css";\n${MAIN}`,
    );
    await fsp.mkdir(path.join(work, "src", "styles"), { recursive: true });
    await fsp.writeFile(path.join(work, "src", "styles", "app.css"), "");
    await fsp.writeFile(
      path.join(work, "package.json"),
      JSON.stringify({ name: "demo" }, null, 2),
    );
    expect(ctxFor(work).stylesheet()).toBe("src/styles/app.css");
  });

  it("stylesheet finds a common name when nothing is imported", async () => {
    await fsp.writeFile(path.join(work, "src", "index.css"), "");
    await fsp.writeFile(
      path.join(work, "package.json"),
      JSON.stringify({ name: "demo" }, null, 2),
    );
    expect(ctxFor(work).stylesheet()).toBe("src/index.css");
  });

  it("stylesheet({createIfMissing}) records addFile + ensureImport and wires it", async () => {
    await fsp.writeFile(path.join(work, "src", "main.tsx"), MAIN);
    await fsp.writeFile(
      path.join(work, "package.json"),
      JSON.stringify({ name: "demo" }, null, 2),
    );
    const ctx = ctxFor(work);
    const css = ctx.stylesheet({ createIfMissing: true });
    expect(css).toBe("src/index.css");

    const ops = ctx.ops;
    expect(
      ops.some((o) => o.op === "addFile" && o.to === "src/index.css"),
    ).toBe(true);
    expect(
      ops.some(
        (o) =>
          o.op === "ensureImport" &&
          o.file === "src/main.tsx" &&
          o.import === "./index.css",
      ),
    ).toBe(true);
  });

  it("configFile resolves the real extension, null when absent", async () => {
    await fsp.writeFile(path.join(work, "vite.config.ts"), "export default {};");
    const ctx = ctxFor(work);
    expect(ctx.configFile("vite")).toBe("vite.config.ts");
    expect(ctx.configFile("tailwind")).toBeNull();
  });
});

describe("stylesheet createIfMissing — end-to-end file creation", () => {
  it("creates the css, wires the import, and composes a later ensureLine", async () => {
    await fsp.writeFile(path.join(work, "src", "main.tsx"), MAIN);
    await fsp.writeFile(
      path.join(work, "package.json"),
      JSON.stringify({ name: "demo", type: "module" }, null, 2),
    );

    const manifest = packedManifest(
      `const css = ctx.stylesheet({ createIfMissing: true });\n` +
        `ctx.ensureLine(css, '@import "tailwindcss";', { position: "top" });`,
    );

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
    });

    expect(result.status).toBe("success");
    // css created and wired into the entry.
    const css = fs.readFileSync(path.join(work, "src", "index.css"), "utf8");
    expect(css).toContain('@import "tailwindcss";');
    const main = fs.readFileSync(path.join(work, "src", "main.tsx"), "utf8");
    expect(main).toContain('import "./index.css";');
  });
});
