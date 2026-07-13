/**
 * Tool-handler tests (SPEC §8). The handlers are plain functions, so we exercise
 * them directly — no MCP transport needed. installer/runner are mocked so tests
 * never hit the network, and we prove the consent handshake end-to-end.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InstallSpec } from "@xinit/core";

import {
  addPluginTool,
  detectTool,
  doctorTool,
  getGraphTool,
  listPluginsTool,
  searchPluginsTool,
  type ConfirmationRequired,
} from "./tools.js";

// Repo layout: packages/mcp/src/tools.test.ts → repo root is three levels up.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const pluginsDir = path.join(repoRoot, "plugins");
const shadcnDir = path.join(pluginsDir, "shadcn");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xinit-mcp-test-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A minimal React-ish app so shadcn's patches apply against real files. */
function scaffoldApp(dir: string): void {
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "web", version: "0.0.0", dependencies: {} }, null, 2),
  );
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: {} }, null, 2),
  );
  fs.writeFileSync(
    path.join(dir, "vite.config.ts"),
    'import { defineConfig } from "vite";\nexport default defineConfig({});\n',
  );
}

describe("detect_project", () => {
  it("returns the expected Project for a temp project", async () => {
    scaffoldApp(tmp);
    const project = await detectTool({ root: tmp });

    expect(project.root).toBe(path.resolve(tmp));
    expect(project.kind).toBe("single");
    expect(Array.isArray(project.apps)).toBe(true);
    expect(project.apps.length).toBeGreaterThan(0);
    expect(typeof project.manager).toBe("string");
    expect(typeof project.confidence).toBe("number");
  });
});

describe("list_plugins / search_plugins", () => {
  it("lists the bundled reference plugins", () => {
    const { plugins } = listPluginsTool({}, { pluginsDir });
    const names = plugins.map((p) => p.name);
    expect(names).toContain("shadcn");
    expect(names).toContain("react");
    // Internal absolute dir must not leak to the agent.
    expect(plugins.every((p) => !("dir" in p))).toBe(true);
  });

  it("filters by name/displayName", () => {
    const { plugins } = searchPluginsTool({ query: "shad" }, { pluginsDir });
    expect(plugins.map((p) => p.name)).toEqual(["shadcn"]);
  });

  it("surfaces the languages field and filters by target app language", () => {
    const all = listPluginsTool({}, { pluginsDir }).plugins;
    // The bundled reference plugins are all JS/TS.
    expect(all.every((p) => p.languages?.includes("ts"))).toBe(true);

    // Filtering for a python app excludes every JS/TS-only plugin.
    const py = listPluginsTool({ language: "python" }, { pluginsDir }).plugins;
    expect(py).toEqual([]);

    // A ts app keeps them.
    const ts = listPluginsTool({ language: "ts" }, { pluginsDir }).plugins;
    expect(ts.length).toBe(all.length);
  });
});

describe("add_plugin consent handshake (SPEC §8)", () => {
  it("third-party exec+network plugin returns confirmation_required, runs nothing, then proceeds with the token", async () => {
    scaffoldApp(tmp);

    const installer = vi.fn(async (_dir: string, _spec: InstallSpec) => {});
    const runner = vi.fn(async (_dir: string, _cmd: string) => {});

    // shadcn is referenced by PATH ⇒ third-party; it declares exec + network.
    const args = { plugin: shadcnDir, app: tmp } as const;

    // --- first call: gate, do not run ---
    const first = await addPluginTool(args, { installer, runner });
    expect(first.status).toBe("confirmation_required");
    const gated = first as ConfirmationRequired;

    expect(gated.trust).toBe("third-party");
    expect(typeof gated.confirmToken).toBe("string");
    expect(gated.confirmToken.length).toBeGreaterThan(0);
    expect(gated.plan.commands).toContain("npx shadcn@latest init -d");
    expect(gated.capabilities).toEqual(
      expect.arrayContaining(["exec", "network"]),
    );

    // Nothing ran, and no file was written (components.json absent).
    expect(installer).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmp, "components.json"))).toBe(false);

    // --- second call: same args + token ⇒ proceed ---
    const second = await addPluginTool(
      { ...args, confirm: gated.confirmToken },
      { installer, runner },
    );
    expect(second.status).toBe("success");
    expect(runner).toHaveBeenCalledWith(tmp, "npx shadcn@latest init -d");
  });

  it("rejects an unknown bundled plugin name", async () => {
    await expect(
      addPluginTool({ plugin: "does-not-exist", app: tmp }, { pluginsDir }),
    ).rejects.toThrow(/Unknown plugin/);
  });
});

describe("doctor / get_graph", () => {
  it("doctor reports apps and warnings without mutating", async () => {
    scaffoldApp(tmp);
    const report = await doctorTool({ root: tmp });
    expect(report.root).toBe(path.resolve(tmp));
    expect(Array.isArray(report.apps)).toBe(true);
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(Array.isArray(report.detectedPlugins)).toBe(true);
  });

  it("get_graph returns a repo node and structured edges", async () => {
    scaffoldApp(tmp);
    const graph = await getGraphTool({ root: tmp });
    expect(graph.nodes.some((n) => n.type === "repo")).toBe(true);
    expect(graph.nodes.some((n) => n.type === "app")).toBe(true);
    for (const edge of graph.edges) {
      expect(graph.nodes.some((n) => n.id === edge.from)).toBe(true);
      expect(graph.nodes.some((n) => n.id === edge.to)).toBe(true);
    }
  });
});
