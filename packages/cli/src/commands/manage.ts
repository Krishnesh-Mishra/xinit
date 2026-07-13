import { isCancel, select } from "@clack/prompts";
import type { DetectedApp } from "@xinit/core";

import { IO } from "../lib/io.js";
import {
  listPlugins,
  pluginAppliesToApp,
  resolvePluginsDir,
} from "../lib/plugins.js";
import { CancelledError, interactivePrompter } from "../lib/prompts.js";
import { pnpmInstaller, shellRunner } from "../lib/system.js";
import { applyPluginToApp } from "./add.js";
import { runDetect } from "./detect.js";

export interface ManageDeps {
  io?: IO;
  cwd?: string;
  pluginsDir?: string;
}

const CLACK = { input: process.stdin, output: process.stderr } as const;

async function pick(
  message: string,
  options: { value: string; label: string }[],
): Promise<string> {
  const v = await select({ message, options, ...CLACK });
  if (isCancel(v)) throw new CancelledError();
  return v;
}

/**
 * `xinit manage` — interactive: detect → Apps|Packages → unit → add a compatible
 * plugin, then run the shared add flow. No remove in v1 (SPEC §8).
 */
export async function runManage(deps: ManageDeps = {}): Promise<void> {
  const io = deps.io ?? new IO({});
  const cwd = deps.cwd ?? process.cwd();
  const project = await runDetect(cwd);

  io.note(io.c.bold(`Managing ${project.root}`));

  const scope = await pick("Manage which?", [
    { value: "apps", label: `Apps (${project.apps.length})` },
    { value: "packages", label: `Packages (${project.packages.length})` },
  ]);

  const units: DetectedApp[] = scope === "apps" ? project.apps : project.packages;
  if (units.length === 0) {
    io.note(io.c.yellow(`No ${scope} to manage.`));
    return;
  }

  const unitName = await pick(
    "Which one?",
    units.map((u) => ({ value: u.name, label: `${u.name} (${u.path})` })),
  );
  const app = units.find((u) => u.name === unitName)!;

  const action = await pick("Action", [{ value: "add", label: "Add plugin" }]);
  if (action !== "add") return;

  const pluginsDir = resolvePluginsDir(deps.pluginsDir);
  const available = listPlugins(pluginsDir).filter(
    (p) =>
      pluginAppliesToApp(p.manifest, {
        framework: app.framework,
        language: app.language,
      }) &&
      !app.plugins.includes(p.manifest.name),
  );

  if (available.length === 0) {
    io.note(io.c.yellow(`No compatible plugins to add to ${app.name}.`));
    return;
  }

  const chosenName = await pick(
    "Add plugin",
    available.map((p) => ({ value: p.manifest.name, label: p.manifest.displayName })),
  );
  const resolved = available.find((p) => p.manifest.name === chosenName)!;

  await applyPluginToApp({
    resolved,
    project,
    app,
    flags: {},
    io,
    installer: pnpmInstaller,
    runner: shellRunner,
    prompter: interactivePrompter,
  });
}
