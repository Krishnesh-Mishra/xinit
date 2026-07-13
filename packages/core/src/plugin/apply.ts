/**
 * Apply (SPEC §6). Realizes a Plan inside a file-snapshot transaction: every
 * target file is tracked, then its patch is re-applied against the *actual*
 * current disk bytes (so apply stays idempotent even if state drifted since the
 * plan was built) and written. Installs are batched into a single injected
 * `installer` call; exec commands go through an injected `runner`. Any failure
 * rolls the whole transaction back. installer/runner are injectable so tests
 * never hit the network.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import type { ApplyResult, Op, Plan } from "../types.js";
import { createTransaction } from "../tx/index.js";
import { detectManager } from "../detect/manager.js";
import {
  ensureImport,
  ensureLine,
  patchConfig,
  patchJson,
  patchToml,
  upsertEnv,
  wrapJsx,
} from "../patch/index.js";
import { installCommands } from "./install-cmd.js";

export interface InstallSpec {
  deps: string[];
  devDeps: string[];
  /**
   * The app's detected package manager (pnpm | npm | yarn | bun | uv | poetry |
   * pip | …). The installer builds its command via `installCommands`, so a
   * Python+uv app runs `uv add …` instead of `pnpm add …`. Defaults to pnpm.
   */
  manager?: string;
}
export type Installer = (appDir: string, spec: InstallSpec) => Promise<void>;
export type Runner = (appDir: string, cmd: string) => Promise<void>;

export interface ApplyOptions {
  installer?: Installer;
  runner?: Runner;
}

function shell(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: true, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`\`${cmd} ${args.join(" ")}\` exited with ${code}`)),
    );
  });
}

/**
 * Default installer: builds the manager-appropriate command(s) via
 * `installCommands` (pnpm add / uv add / poetry add / …) and runs each in
 * `appDir`. Falls back to pnpm when no manager hint is present.
 */
const defaultInstaller: Installer = async (appDir, { deps, devDeps, manager }) => {
  for (const cmd of installCommands(manager ?? "pnpm", deps, devDeps)) {
    await shell(cmd, [], appDir);
  }
};

const defaultRunner: Runner = (appDir, cmd) => shell(cmd, [], appDir);

/** Compute the new content for a file-mutating op against current disk bytes. */
function realizeFileOp(
  op: Op,
  before: string,
): { file: string; content: string } | null {
  switch (op.op) {
    case "addFile":
      return { file: op.to, content: op.content };
    case "patchJson":
      return { file: op.file, content: patchJson(before, op.merge).content };
    case "patchToml":
      return { file: op.file, content: patchToml(before, op.merge).content };
    case "patchConfig":
      return { file: op.file, content: patchConfig(before, op.edit).content };
    case "ensureLine":
      return {
        file: op.file,
        content: ensureLine(before, op.line, op.opts).content,
      };
    case "setEnv":
      return { file: op.file, content: upsertEnv(before, op.key, op.value).content };
    case "ensureImport":
      return {
        file: op.file,
        content: ensureImport(before, {
          import: op.import,
          named: op.named,
          default: op.default,
          from: op.from,
          call: op.call,
        }).content,
      };
    case "wrap":
      // Re-run against actual disk bytes; unresolvable ⇒ leave content as-is
      // (the plan already surfaced the manual-step warning).
      return { file: op.file, content: wrapJsx(before, op.wrappers).content };
    case "setScript":
      return {
        file: "package.json",
        content: patchJson(before, { scripts: { [op.name]: op.command } })
          .content,
      };
    default:
      return null;
  }
}

export async function applyPlan(
  plan: Plan,
  appDir: string,
  opts: ApplyOptions = {},
): Promise<ApplyResult> {
  const installer = opts.installer ?? defaultInstaller;
  const runner = opts.runner ?? defaultRunner;

  const tx = createTransaction();
  const existedBefore = new Map<string, boolean>();

  try {
    // --- file mutations, in recorded order (order can be load-bearing) ---
    for (const step of plan.steps) {
      const fileFor = fileTarget(step.detail);
      if (fileFor === null) continue;
      const abs = path.join(appDir, fileFor);

      if (!existedBefore.has(abs)) existedBefore.set(abs, fs.existsSync(abs));
      await tx.track(abs);

      const before = fs.existsSync(abs) ? await fsp.readFile(abs, "utf8") : "";
      const realized = realizeFileOp(step.detail, before);
      if (!realized) continue;

      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, realized.content, "utf8");
    }

    // --- batched installs: one installer call ---
    const installed = [...plan.installs.packages, ...plan.installs.dev];
    if (installed.length > 0) {
      await installer(appDir, {
        deps: plan.installs.packages,
        devDeps: plan.installs.dev,
        // The app's manager decides the install syntax (uv/poetry/pip vs pnpm…).
        manager: detectManager(appDir).manager,
      });
    }

    // --- exec commands (weak-guarantee) ---
    for (const cmd of plan.commands) {
      await runner(appDir, cmd);
    }

    await tx.commit();

    const created: string[] = [];
    const modified: string[] = [];
    for (const [abs, existed] of existedBefore) {
      const rel = path.relative(appDir, abs).split(path.sep).join("/");
      (existed ? modified : created).push(rel);
    }

    return {
      status: "success",
      plugin: plan.plugin,
      installed,
      created,
      modified,
      commands: plan.commands,
      warnings: [...plan.warnings],
    };
  } catch (err) {
    await tx.rollback();
    return {
      status: "rolled_back",
      plugin: plan.plugin,
      installed: [],
      created: [],
      modified: [],
      commands: plan.commands,
      warnings: [...plan.warnings, err instanceof Error ? err.message : String(err)],
    };
  }
}

/** The file a mutating op targets, or null for non-file ops. */
function fileTarget(op: Op): string | null {
  switch (op.op) {
    case "addFile":
      return op.to;
    case "patchJson":
    case "patchToml":
    case "patchConfig":
    case "ensureLine":
    case "setEnv":
    case "ensureImport":
    case "wrap":
      return op.file;
    case "setScript":
      return "package.json";
    default:
      return null;
  }
}
