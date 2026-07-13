import { randomUUID } from "node:crypto";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { InstallSpec } from "@initup/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { IO } from "../lib/io.js";
import { listPlugins, resolvePluginsDir } from "../lib/plugins.js";
import type { Prompter } from "../lib/prompts.js";
import {
  allBaseNames,
  compatibleAddons,
  frameworkChoices,
  runCreate,
} from "./create.js";

const registry = listPlugins(resolvePluginsDir());

describe("frameworkChoices — the curated grouping", () => {
  it("is well-formed: JS/TS has Frontend+Backend, Python is single-category", () => {
    const groups = frameworkChoices();
    const ids = groups.map((g) => g.id);
    expect(ids).toEqual(["js-ts", "python"]);

    const jsts = groups.find((g) => g.id === "js-ts")!;
    expect(jsts.categories.map((c) => c.id)).toEqual(["frontend", "backend"]);

    const python = groups.find((g) => g.id === "python")!;
    expect(python.categories).toHaveLength(1);

    // Every framework option carries a non-empty name + label.
    for (const g of groups) {
      for (const c of g.categories) {
        expect(c.frameworks.length).toBeGreaterThan(0);
        for (const f of c.frameworks) {
          expect(f.name).toBeTruthy();
          expect(f.label).toBeTruthy();
        }
      }
    }
  });

  it("exposes react/express/fastapi among the base names", () => {
    const names = allBaseNames();
    for (const n of ["react", "express", "fastapi", "uv", "django"]) {
      expect(names.has(n)).toBe(true);
    }
  });
});

describe("compatibleAddons — base → compatible add-ons", () => {
  it("react includes the React UI add-ons and excludes backend/python bases", () => {
    const addons = compatibleAddons("react", registry);
    expect(addons).toContain("tailwind-v4");
    expect(addons).toContain("shadcn");
    expect(addons).not.toContain("express");
    expect(addons).not.toContain("django");
    // The base itself and other new-app scaffolders are never add-ons.
    expect(addons).not.toContain("react");
    expect(addons).not.toContain("nextjs");
  });

  it("express includes backend integrations like prisma and docker", () => {
    const addons = compatibleAddons("express", registry);
    expect(addons).toContain("prisma");
    expect(addons).toContain("docker");
    expect(addons).not.toContain("tailwind-v4");
    expect(addons).not.toContain("ruff");
  });

  it("fastapi includes python tooling like ruff and excludes JS add-ons", () => {
    const addons = compatibleAddons("fastapi", registry);
    expect(addons).toContain("ruff");
    expect(addons).not.toContain("tailwind-v4");
    expect(addons).not.toContain("docker");
  });

  it("returns nothing for an unknown base", () => {
    expect(compatibleAddons("not-a-base", registry)).toEqual([]);
  });
});

describe("runCreate — scripted wizard with an injected installer", () => {
  let work: string;

  beforeEach(async () => {
    work = path.join(os.tmpdir(), `initup-cli-create-${randomUUID()}`);
    await fsp.mkdir(work, { recursive: true });
  });

  afterEach(async () => {
    await fsp.rm(work, { recursive: true, force: true });
  });

  it("scaffolds react then tailwind-v4 via a mock installer, in order", async () => {
    const installs: InstallSpec[] = [];
    const installer = async (_dir: string, spec: InstallSpec) => {
      installs.push(spec);
    };
    // Answer every plugin prompt with its declared default (offline, deterministic).
    const prompter: Prompter = (p) => Promise.resolve(p.default);

    const result = await runCreate(
      undefined,
      {},
      {
        io: new IO({ silent: true }),
        cwd: work,
        installer,
        prompter,
        wizard: async () => ({ base: "react", addons: ["tailwind-v4"] }),
      },
    );

    expect(result.status).toBe("success");
    expect(result.applied.map((a) => a.plugin)).toEqual(["react", "tailwind-v4"]);
    for (const step of result.applied) {
      expect(step.result.status).toBe("success");
    }
    // The base scaffolded and the add-on ran — one installer call per plugin.
    expect(installs.length).toBe(2);
  });

  it("returns 'cancelled' when the wizard declines to scaffold", async () => {
    const result = await runCreate(
      undefined,
      {},
      {
        io: new IO({ silent: true }),
        cwd: work,
        wizard: async () => null,
      },
    );
    expect(result.status).toBe("cancelled");
    expect(result.applied).toEqual([]);
  });

  it("errors non-interactively without a base template", async () => {
    await expect(
      runCreate(undefined, {}, { io: new IO({ silent: true }), cwd: work }),
    ).rejects.toThrow(/base template/);
  });
});
