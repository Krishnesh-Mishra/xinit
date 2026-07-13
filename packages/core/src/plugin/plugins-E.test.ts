/**
 * Batch E plugins — end-to-end via pack() + addPlugin() on temp fixtures with a
 * mocked installer/runner (no network). Covers:
 *   react-native-expo · heroui-native · uniwind · prisma · drizzle
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pack, addPlugin } from "./index.js";
import type { InstallSpec } from "./apply.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PLUGINS = path.join(REPO_ROOT, "plugins");
const DIR = (name: string) => path.join(PLUGINS, name);

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-E-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
});
afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

async function writePkg(dir: string, pkg: Record<string, unknown>): Promise<void> {
  await fsp.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "demo", private: true, type: "module", ...pkg }, null, 2) + "\n",
  );
}

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(work, rel));

/** Installer that records the captured spec and call count. */
function recordingInstaller() {
  const state = { calls: 0, spec: undefined as InstallSpec | undefined };
  const installer = async (_dir: string, spec: InstallSpec) => {
    state.calls++;
    state.spec = spec;
  };
  return { state, installer };
}

// ---------------------------------------------------------------------------
// 1. react-native-expo — CLI (exec) plugin
// ---------------------------------------------------------------------------
describe("react-native-expo", () => {
  it("plans the create-expo-app CLI command (non-interactive)", async () => {
    await writePkg(work, {});
    const manifest = await pack(DIR("react-native-expo"));
    expect(manifest.capabilities).toEqual({ install: false, exec: true, network: true });

    const commands: string[] = [];
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
      runner: async (_dir, cmd) => {
        commands.push(cmd);
      },
    });

    expect(result.status).toBe("success");
    expect(result.commands).toContain("npx create-expo-app@latest . --yes");
    expect(commands).toContain("npx create-expo-app@latest . --yes");
  });
});

// ---------------------------------------------------------------------------
// 2. heroui-native — exact CSS order + provider wrap
// ---------------------------------------------------------------------------
describe("heroui-native", () => {
  it("records peer deps, orders CSS imports, and wraps the app root", async () => {
    // Fixture: an Expo-ish app with an entry App.tsx + a global.css.
    await writePkg(work, { dependencies: { expo: "^54.0.0" } });
    await fsp.writeFile(
      path.join(work, "App.tsx"),
      `import { View } from "react-native";\nexport default function App() { return <View />; }\n`,
    );
    await fsp.writeFile(path.join(work, "global.css"), "");

    const { state, installer } = recordingInstaller();
    const manifest = await pack(DIR("heroui-native"));
    expect(manifest.dependsOn).toContain("uniwind");
    expect(manifest.capabilities).toEqual({ install: true, exec: false, network: false });

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");

    // --- peer deps recorded (component + pinned peers) ---
    expect(result.installed).toEqual(
      expect.arrayContaining([
        "heroui-native",
        "react-native-reanimated@^4.1.1",
        "react-native-gesture-handler@^2.28.0",
        "react-native-worklets@^0.5.1",
        "react-native-safe-area-context@^5.6.0",
        "react-native-svg@^15.12.1",
        "tailwind-variants@^3.2.2",
        "tailwind-merge@^3.4.0",
      ]),
    );
    expect(state.calls).toBe(1);

    // --- CSS import ORDER is load-bearing: tailwind → uniwind → heroui-native ---
    const css = read("global.css");
    const tw = css.indexOf("@import 'tailwindcss'");
    const uni = css.indexOf("@import 'uniwind'");
    const hero = css.indexOf("@import 'heroui-native/styles'");
    expect(tw).toBeGreaterThanOrEqual(0);
    expect(uni).toBeGreaterThan(tw);
    expect(hero).toBeGreaterThan(uni);

    // --- app root wrapped (GestureHandlerRootView + HeroUINativeProvider),
    //     OR a manual-step warning if the codemod could not locate the root ---
    const app = read("App.tsx");
    const wrapped =
      app.includes("<GestureHandlerRootView") &&
      app.includes("<HeroUINativeProvider");
    const warned = result.warnings.join(" ").includes("Could not auto-wrap App.tsx");
    expect(wrapped || warned).toBe(true);
    // In this fixture the default-exported component IS resolvable → real wrap.
    expect(wrapped).toBe(true);
    expect(app).toMatch(/from\s+"react-native-gesture-handler"/);
    expect(app).toMatch(/from\s+"heroui-native"/);
  });
});

// ---------------------------------------------------------------------------
// 3. uniwind — install + CSS + metro config
// ---------------------------------------------------------------------------
describe("uniwind", () => {
  it("installs packages, orders CSS imports, and writes a metro config", async () => {
    await writePkg(work, { dependencies: { expo: "^54.0.0" } });
    await fsp.writeFile(
      path.join(work, "App.tsx"),
      `import { View } from "react-native";\nexport default function App() { return <View />; }\n`,
    );
    await fsp.writeFile(path.join(work, "global.css"), "");

    const { state, installer } = recordingInstaller();
    const manifest = await pack(DIR("uniwind"));
    expect(manifest.capabilities).toEqual({ install: true, exec: false, network: false });

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toContain("uniwind");
    expect(state.spec?.devDeps).toContain("tailwindcss");

    const css = read("global.css");
    const tw = css.indexOf("@import 'tailwindcss'");
    const uni = css.indexOf("@import 'uniwind'");
    expect(tw).toBeGreaterThanOrEqual(0);
    expect(uni).toBeGreaterThan(tw);

    // No metro config in the fixture → one is written, wrapped correctly.
    expect(exists("metro.config.js")).toBe(true);
    const metro = read("metro.config.js");
    expect(metro).toContain("withUniwindConfig");
    expect(metro).toContain("./global.css");

    // Babel worklets step is surfaced as a manual warning.
    expect(result.warnings.join(" ")).toMatch(/react-native-worklets\/plugin/);
  });
});

// ---------------------------------------------------------------------------
// 4. prisma — schema + deps + .env + script
// ---------------------------------------------------------------------------
describe("prisma", () => {
  it("writes a provider-specific schema, deps, .env and generate script", async () => {
    await writePkg(work, {});
    const { installer } = recordingInstaller();
    const manifest = await pack(DIR("prisma"));
    expect(manifest.capabilities).toEqual({ install: true, exec: false, network: false });

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      answers: { provider: "sqlite" },
      installer,
    });

    expect(result.status).toBe("success");
    expect(result.installed).toEqual(
      expect.arrayContaining(["prisma", "@prisma/client"]),
    );

    const schema = read("prisma/schema.prisma");
    expect(schema).toContain('provider = "sqlite"');
    expect(schema).toContain('url      = env("DATABASE_URL")');

    expect(read(".env")).toMatch(/DATABASE_URL=/);

    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["db:generate"]).toBe("prisma generate");
  });
});

// ---------------------------------------------------------------------------
// 5. drizzle — config + schema + deps + .env + script
// ---------------------------------------------------------------------------
describe("drizzle", () => {
  it("writes drizzle.config + schema + deps for the chosen driver", async () => {
    await writePkg(work, {});
    const { state, installer } = recordingInstaller();
    const manifest = await pack(DIR("drizzle"));
    expect(manifest.capabilities).toEqual({ install: true, exec: false, network: false });

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      answers: { driver: "pg" },
      installer,
    });

    expect(result.status).toBe("success");
    expect(state.spec?.deps).toEqual(
      expect.arrayContaining(["drizzle-orm", "postgres"]),
    );
    expect(state.spec?.devDeps).toContain("drizzle-kit");

    const config = read("drizzle.config.ts");
    expect(config).toContain('dialect: "postgresql"');
    expect(config).toContain('schema: "./src/db/schema.ts"');
    expect(config).toContain("process.env.DATABASE_URL");

    const schema = read("src/db/schema.ts");
    expect(schema).toContain("drizzle-orm/pg-core");
    expect(schema).toContain("pgTable");

    expect(read(".env")).toMatch(/DATABASE_URL=/);

    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["db:push"]).toBe("drizzle-kit push");
  });
});
