/**
 * M3: plugin runtime — the integration seam that ties patch, transaction and
 * detection into a working add-a-plugin flow (SPEC §4–§9).
 *
 * `addPlugin` orchestrates: load → run setup() in the sandbox with a recording
 * ctx → build a Plan → gate on consent (MCP handshake) → apply inside a
 * transaction. Reads run immediately; writes are deferred and only realized on
 * a committed transaction, so every run is idempotent and reversible.
 */
import type {
  Answers,
  ApplyResult,
  Prompt,
  PluginManifest,
} from "../types.js";

import { InProcessSandbox } from "./sandbox.js";
import { RecordingCtx } from "./ctx.js";
import { buildPlan, type Trust } from "./plan.js";
import { applyPlan, type Installer, type Runner } from "./apply.js";
import {
  loadPluginFromDir,
  loadPluginPacked,
  type LoadedPlugin,
} from "./load.js";

export interface AddPluginOptions {
  /** An authored plugin folder path, or an already-packed manifest. */
  pluginDirOrManifest: string | PluginManifest;
  appDir: string;
  /** Monorepo root; defaults to appDir for single-app projects. */
  repoRoot?: string;
  answers?: Answers;
  /** first-party runs immediately; third-party + exec/network needs consent. */
  trust?: Trust;
  /** Consent token from a prior `confirmation_required` response (SPEC §8). */
  confirm?: string;
  /** Prompt handler; defaults to returning each prompt's declared default. */
  prompter?: (p: Prompt) => Promise<unknown>;
  /** Injected package installer (defaults to pnpm add). */
  installer?: Installer;
  /** Injected command runner (defaults to a shell). */
  runner?: Runner;
}

const defaultPrompter = async (p: Prompt): Promise<unknown> => p.default;

export async function addPlugin(opts: AddPluginOptions): Promise<ApplyResult> {
  const trust: Trust = opts.trust ?? "first-party";
  const answers: Answers = opts.answers ?? {};

  const loaded: LoadedPlugin =
    typeof opts.pluginDirOrManifest === "string"
      ? await loadPluginFromDir(opts.pluginDirOrManifest)
      : loadPluginPacked(opts.pluginDirOrManifest);

  const { manifest } = loaded;

  // --- run setup() in the sandbox with a recording ctx ---
  const ctx = new RecordingCtx({
    appDir: opts.appDir,
    repoRoot: opts.repoRoot ?? opts.appDir,
    answers,
    prompter: opts.prompter ?? defaultPrompter,
    file: (ref) => loaded.file(ref),
    capabilities: manifest.capabilities,
  });

  const sandbox = new InProcessSandbox();
  await sandbox.run(loaded.setupSource, ctx, answers);

  // --- build the reviewable Plan ---
  const plan = buildPlan(manifest.name, ctx.ops, opts.appDir, {
    trust,
    capabilities: manifest.capabilities,
    warnings: ctx.warnings,
  });

  // --- consent handshake (SPEC §8): gate before touching disk ---
  if (plan.requiresConfirmation && opts.confirm !== plan.confirmToken) {
    return {
      status: "confirmation_required",
      plugin: manifest.name,
      installed: [],
      created: [],
      modified: [],
      commands: plan.commands,
      warnings: [...plan.warnings],
      confirmToken: plan.confirmToken,
      plan,
    };
  }

  // --- apply transactionally ---
  return applyPlan(plan, opts.appDir, {
    installer: opts.installer,
    runner: opts.runner,
  });
}

// --- public surface ---------------------------------------------------------
export { definePlugin, pluginMake, type PluginDefinition } from "./define.js";
export { pack } from "./pack.js";
export { readManifestFacts, isPluginDir } from "./facts.js";
export {
  loadPluginFromDir,
  loadPluginPacked,
  type LoadedPlugin,
} from "./load.js";
export { RecordingCtx, type RecordingCtxOptions } from "./ctx.js";
export { InProcessSandbox } from "./sandbox.js";
export { buildPlan, type Trust, type BuildPlanOptions } from "./plan.js";
export {
  applyPlan,
  type Installer,
  type Runner,
  type InstallSpec,
  type ApplyOptions,
} from "./apply.js";
export { installCommands } from "./install-cmd.js";
export { loadRegistry, type Registry, type RegistryEntry } from "./registry.js";
export {
  resolvePlugins,
  readAppDeps,
  type ResolveResult,
} from "./resolve.js";
