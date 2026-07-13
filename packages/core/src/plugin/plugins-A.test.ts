/**
 * Batch A plugins — the "create a new app" scaffolders that wrap an official
 * create-CLI: nextjs, vue, sveltekit.
 *
 * Their effect is opaque (a subprocess), so we do NOT assert file bytes. We
 * assert the *plan/result*: the exact `npx …` command string is planned, the
 * declared capabilities are correct, no unexpected file patches are produced,
 * and the injected installer/runner are exercised without ever hitting the
 * network (both are mocks that only record calls).
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

interface Fixture {
  name: string;
  dir: string;
  /** Answers to drive setup(); undefined ⇒ prompt defaults. */
  answers?: Record<string, unknown>;
  /** Substrings the planned command MUST contain. */
  commandIncludes: string[];
  install: boolean;
  /** Number of ctx.warn manual-step warnings expected. */
  warnings: number;
}

const FIXTURES: Fixture[] = [
  {
    name: "nextjs",
    dir: path.join(PLUGINS, "nextjs"),
    commandIncludes: [
      "npx create-next-app@latest .",
      "--ts",
      "--app",
      "--tailwind",
      "--eslint",
      "--use-pnpm",
      "--yes",
    ],
    install: true,
    warnings: 0,
  },
  {
    name: "vue",
    dir: path.join(PLUGINS, "vue"),
    commandIncludes: ["npm create vue@latest . --", "--ts", "--force"],
    install: false,
    warnings: 1,
  },
  {
    name: "sveltekit",
    dir: path.join(PLUGINS, "sveltekit"),
    answers: { ts: true, template: "minimal", addons: ["eslint", "prettier"] },
    commandIncludes: [
      "npx sv create .",
      "--template minimal",
      "--types ts",
      "--add eslint prettier",
      "--no-install",
      "--no-dir-check",
    ],
    install: false,
    warnings: 1,
  },
];

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-plugins-A-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
  // A minimal package.json so the app dir looks like a project root.
  await fsp.writeFile(
    path.join(work, "package.json"),
    JSON.stringify({ name: "demo", private: true, type: "module" }, null, 2),
  );
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

describe.each(FIXTURES)("batch-A plugin: $name", (fx) => {
  it("packs with the correct facts + capabilities", async () => {
    const manifest = await pack(fx.dir);

    expect(manifest.name).toBe(fx.name);
    expect(manifest.appliesTo).toEqual({ type: "new-app" });
    expect(manifest.languages).toEqual(["ts", "js"]);
    // Every scaffolder shells out and downloads over the network.
    expect(manifest.capabilities.exec).toBe(true);
    expect(manifest.capabilities.network).toBe(true);
    expect(manifest.capabilities.install).toBe(fx.install);
    // Pure create-CLI wrappers ship no bundled template files.
    expect(manifest.files).toBeUndefined();
  });

  it("gates behind consent and plans the exact create-CLI command (third-party)", async () => {
    const manifest = await pack(fx.dir);

    let installerCalled = false;
    let runnerCalled = false;

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      answers: fx.answers,
      trust: "third-party",
      installer: async () => {
        installerCalled = true;
      },
      runner: async () => {
        runnerCalled = true;
      },
    });

    // exec + network on a third-party plugin ⇒ consent handshake (SPEC §8).
    expect(result.status).toBe("confirmation_required");
    expect(typeof result.confirmToken).toBe("string");
    expect(result.confirmToken).not.toBe("");

    const plan = result.plan;
    expect(plan).toBeDefined();
    expect(plan!.capabilities).toEqual(
      expect.arrayContaining(["exec", "network"]),
    );

    // The single planned command is the create-CLI invocation.
    expect(plan!.commands).toHaveLength(1);
    const command = plan!.commands[0]!;
    for (const needle of fx.commandIncludes) {
      expect(command).toContain(needle);
    }

    // No file patches — the CLI owns all file creation.
    expect(plan!.steps).toHaveLength(0);
    // Manual-step warnings surfaced via ctx.warn are carried into the Plan.
    expect(plan!.warnings).toHaveLength(fx.warnings);

    // Consent gate held: nothing ran, no network touched.
    expect(installerCalled).toBe(false);
    expect(runnerCalled).toBe(false);
  });

  it("runs the create-CLI through the injected runner (first-party)", async () => {
    const manifest = await pack(fx.dir);

    const runnerCalls: Array<{ appDir: string; cmd: string }> = [];
    let installSpec: InstallSpec | undefined;

    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      answers: fx.answers,
      trust: "first-party",
      installer: async (_dir, spec) => {
        installSpec = spec;
      },
      runner: async (appDir, cmd) => {
        runnerCalls.push({ appDir, cmd });
      },
    });

    // First-party ⇒ no consent gate; the plan applies immediately.
    expect(result.status).toBe("success");

    // The command reached the runner exactly once, in the app dir.
    expect(runnerCalls).toHaveLength(1);
    expect(runnerCalls[0]!.appDir).toBe(work);
    for (const needle of fx.commandIncludes) {
      expect(runnerCalls[0]!.cmd).toContain(needle);
    }
    // And it is mirrored on the result.
    expect(result.commands).toEqual([runnerCalls[0]!.cmd]);

    // These wrappers install nothing through ctx.install ⇒ installer untouched.
    expect(installSpec).toBeUndefined();
    expect(result.installed).toEqual([]);

    // Manual-step warnings preserved on the result.
    expect(result.warnings).toHaveLength(fx.warnings);
  });
});
