import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import type { ApplyResult, Installer, Runner } from "@xinit/core";

import { IO } from "../lib/io.js";
import { resolvePluginArg, resolvePluginsDir } from "../lib/plugins.js";
import { interactivePrompter, silentPrompter } from "../lib/prompts.js";
import type { Prompter } from "../lib/prompts.js";
import { pnpmInstaller, shellRunner } from "../lib/system.js";
import { applyPluginToApp } from "./add.js";
import { runDetect } from "./detect.js";

/** v1 ships a single scaffold template. */
const TEMPLATES: Record<string, string> = { react: "react" };

export interface CreateFlags {
  dir?: string;
  json?: boolean;
  silent?: boolean;
  yes?: boolean;
  pluginsDir?: string;
}

export interface CreateDeps {
  io?: IO;
  cwd?: string;
  installer?: Installer;
  runner?: Runner;
  prompter?: Prompter;
}

/**
 * `xinit create [template]` — v1 minimal scaffold: run the base plugin (react)
 * in a target dir. Pre-seeds a minimal package.json so script/dep patches apply.
 */
export async function runCreate(
  template: string | undefined,
  flags: CreateFlags,
  deps: CreateDeps = {},
): Promise<ApplyResult> {
  const io = deps.io ?? new IO({ json: flags.json, silent: flags.silent });
  const cwd = deps.cwd ?? process.cwd();
  const nonInteractive = io.json || io.silent;

  const tpl = template ?? "react";
  const pluginName = TEMPLATES[tpl];
  if (!pluginName) {
    throw new Error(
      `Unknown template "${tpl}". v1 supports: ${Object.keys(TEMPLATES).join(", ")}.`,
    );
  }

  const targetDir = path.resolve(cwd, flags.dir ?? ".");
  await fsp.mkdir(targetDir, { recursive: true });

  // Seed a minimal package.json so setScript/install patches have a target.
  const pkgPath = path.join(targetDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    const name = path.basename(targetDir) || "app";
    await fsp.writeFile(
      pkgPath,
      JSON.stringify({ name, private: true, type: "module" }, null, 2) + "\n",
    );
  }

  const pluginsDir = resolvePluginsDir(flags.pluginsDir);
  const resolved = resolvePluginArg(pluginName, pluginsDir);

  const project = await runDetect(targetDir);
  const app = project.apps[0]!;

  const prompter: Prompter =
    deps.prompter ?? (nonInteractive ? silentPrompter : interactivePrompter);

  io.info(io.c.dim(`Scaffolding ${tpl} in ${targetDir}`));

  return applyPluginToApp({
    resolved,
    project,
    app,
    flags: { json: flags.json, silent: flags.silent, yes: flags.yes },
    io,
    installer: deps.installer ?? pnpmInstaller,
    runner: deps.runner ?? shellRunner,
    prompter,
  });
}
