import { addPlugin } from "@xinit/core";
import type {
  Answers,
  ApplyResult,
  DetectedApp,
  Installer,
  Plan,
  Project,
  Runner,
} from "@xinit/core";

import { appDir, selectApp } from "../lib/apps.js";
import { IO } from "../lib/io.js";
import { resolvePluginArg, resolvePluginsDir } from "../lib/plugins.js";
import type { ResolvedPlugin } from "../lib/plugins.js";
import {
  CancelledError,
  gatherAnswers,
  interactivePrompter,
  silentPrompter,
} from "../lib/prompts.js";
import type { Prompter } from "../lib/prompts.js";
import { pnpmInstaller, shellRunner } from "../lib/system.js";
import { runDetect } from "./detect.js";

export interface AddFlags {
  app?: string;
  json?: boolean;
  silent?: boolean;
  yes?: boolean;
  pluginsDir?: string;
  /** JSON object of preset answers (bypasses prompting). */
  answers?: string;
}

export interface AddDeps {
  io?: IO;
  cwd?: string;
  installer?: Installer;
  runner?: Runner;
  /** Override the prompter (tests). */
  prompter?: Prompter;
}

function parseAnswers(raw: string | undefined): Answers | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`--answers is not valid JSON: ${raw}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--answers must be a JSON object of { promptId: value }.");
  }
  return parsed as Answers;
}

function showPlan(plan: Plan | undefined, io: IO): void {
  if (!plan) return;
  const c = io.c;
  io.note("");
  io.note(c.bold(`Plan — ${plan.plugin}`));
  const { packages, dev } = plan.installs;
  if (packages.length || dev.length) {
    const parts: string[] = [];
    if (packages.length) parts.push(packages.join(", "));
    if (dev.length) parts.push(`${c.dim("dev:")} ${dev.join(", ")}`);
    io.note(`  ${c.cyan("install")}  ${parts.join("  ")}`);
  }
  for (const step of plan.steps) {
    io.note(`  ${c.cyan(step.kind)}  ${step.summary}`);
  }
  if (plan.commands.length) {
    io.note(c.yellow("  exec commands (weak-guarantee — effects are opaque):"));
    for (const cmd of plan.commands) io.note(`    $ ${cmd}`);
  }
  io.note(`  ${c.dim("capabilities:")} ${plan.capabilities.join(", ") || "none"}`);
}

function reportResult(result: ApplyResult, io: IO): void {
  if (io.json) {
    io.result(result);
    return;
  }
  const c = io.c;
  switch (result.status) {
    case "success": {
      io.note(c.green(`✓ Added ${result.plugin}`));
      if (result.installed.length) io.note(`  installed: ${result.installed.join(", ")}`);
      if (result.created.length) io.note(`  created:   ${result.created.join(", ")}`);
      if (result.modified.length) io.note(`  modified:  ${result.modified.join(", ")}`);
      if (result.commands.length) io.note(`  ran:       ${result.commands.join(" ; ")}`);
      for (const w of result.warnings) io.warn(`  ! ${w}`);
      break;
    }
    case "rolled_back": {
      io.error(`✗ ${result.plugin} failed — changes rolled back.`);
      for (const w of result.warnings) io.error(`  ${w}`);
      break;
    }
    case "confirmation_required": {
      io.warn(`Confirmation required for ${result.plugin}.`);
      io.note(
        c.dim("Re-run with --yes to proceed, or (agents) re-call with the confirmToken."),
      );
      break;
    }
  }
}

async function confirmProceed(): Promise<boolean> {
  const { confirm, isCancel } = await import("@clack/prompts");
  const answer = await confirm({
    message: "Apply this plan?",
    initialValue: false,
    input: process.stdin,
    output: process.stderr,
  });
  if (isCancel(answer)) throw new CancelledError();
  return answer;
}

export interface ApplyContext {
  resolved: ResolvedPlugin;
  project: Project;
  app: DetectedApp;
  flags: AddFlags;
  io: IO;
  installer: Installer;
  runner: Runner;
  prompter: Prompter;
}

/**
 * Apply a resolved plugin to a chosen app: gather answers, call core `addPlugin`,
 * drive the consent handshake (SPEC §8), and report. Shared by `add` and `manage`.
 */
export async function applyPluginToApp(ctx: ApplyContext): Promise<ApplyResult> {
  const { resolved, project, app, flags, io } = ctx;
  const nonInteractive = io.json || io.silent;
  const targetDir = appDir(project, app);

  const answers = await gatherAnswers(resolved.manifest.prompts, {
    silent: io.silent,
    prompter: ctx.prompter,
    preset: parseAnswers(flags.answers),
  });

  io.info(io.c.dim(`Adding ${resolved.manifest.displayName} → ${app.name} (${app.path})`));

  const applyOnce = (confirm?: string): Promise<ApplyResult> =>
    addPlugin({
      pluginDirOrManifest: resolved.dir,
      appDir: targetDir,
      repoRoot: project.root,
      answers,
      trust: resolved.trust,
      confirm,
      prompter: ctx.prompter,
      installer: ctx.installer,
      runner: ctx.runner,
    });

  let result = await applyOnce();

  if (result.status === "confirmation_required") {
    if (!io.json) showPlan(result.plan, io);

    let proceed: boolean;
    if (flags.yes) proceed = true;
    else if (nonInteractive) proceed = false; // JSON/silent w/o --yes: surface handshake, don't run.
    else proceed = await confirmProceed();

    if (proceed) result = await applyOnce(result.confirmToken);
  }

  reportResult(result, io);
  return result;
}

/**
 * `xinit add <plugin>` — resolve the plugin, pick the target app, and apply.
 * Returns the final `ApplyResult` so the caller can map status → exit code.
 */
export async function runAdd(
  pluginArg: string,
  flags: AddFlags,
  deps: AddDeps = {},
): Promise<ApplyResult> {
  const io = deps.io ?? new IO({ json: flags.json, silent: flags.silent });
  const cwd = deps.cwd ?? process.cwd();
  const nonInteractive = io.json || io.silent;

  const pluginsDir = resolvePluginsDir(flags.pluginsDir);
  const resolved = resolvePluginArg(pluginArg, pluginsDir);

  const project = await runDetect(cwd);
  const app = await selectApp(project, {
    appName: flags.app,
    allowPrompt: !nonInteractive,
  });

  const prompter: Prompter =
    deps.prompter ?? (nonInteractive ? silentPrompter : interactivePrompter);

  return applyPluginToApp({
    resolved,
    project,
    app,
    flags,
    io,
    installer: deps.installer ?? pnpmInstaller,
    runner: deps.runner ?? shellRunner,
    prompter,
  });
}
