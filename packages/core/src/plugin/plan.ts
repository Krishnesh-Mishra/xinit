/**
 * Plan builder (SPEC §5, §8). Turns the ordered write ops recorded by a
 * RecordingCtx into a reviewable Plan: each file-mutating op is projected
 * against current on-disk content via the pure patch engine to produce a human
 * summary + minimal diff, no-ops are dropped, installs are aggregated, and exec
 * commands are surfaced separately (weak guarantee). The consent gate and its
 * replay-proof `confirmToken` are computed here.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type {
  Capabilities,
  Capability,
  Op,
  Plan,
  PlanStep,
  PatchResult,
} from "../types.js";
import {
  ensureImport,
  ensureLine,
  patchConfig,
  patchJson,
} from "../patch/index.js";

export type Trust = "first-party" | "third-party";

export interface BuildPlanOptions {
  trust: Trust;
  /** Declared capabilities from the manifest (network is only knowable here). */
  capabilities: Capabilities;
  /** Manual steps surfaced by the plugin via ctx.warn (carried into the Plan). */
  warnings?: string[];
}

/** Minimal unified-ish diff: emit only the changed region (common ends trimmed). */
function makeDiff(before: string, after: string): string {
  if (before === after) return "";
  const a = before === "" ? [] : before.split(/\r?\n/);
  const b = after === "" ? [] : after.split(/\r?\n/);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const lines: string[] = [];
  for (let i = start; i <= endA; i++) lines.push(`- ${a[i]}`);
  for (let i = start; i <= endB; i++) lines.push(`+ ${b[i]}`);
  return lines.join("\n");
}

function readDisk(appDir: string, file: string): string {
  try {
    return fs.readFileSync(path.join(appDir, file), "utf8");
  } catch {
    return "";
  }
}

/**
 * Project a single file-mutating op against current disk content.
 * Returns null for ops that do not mutate a file (installs/run).
 */
function projectFileOp(
  op: Op,
  appDir: string,
): { file: string; before: string; result: PatchResult; summary: string } | null {
  switch (op.op) {
    case "addFile": {
      const before = readDisk(appDir, op.to);
      return {
        file: op.to,
        before,
        result: { changed: before !== op.content, content: op.content },
        summary: `create ${op.to}`,
      };
    }
    case "patchJson": {
      const before = readDisk(appDir, op.file);
      return {
        file: op.file,
        before,
        result: patchJson(before, op.merge),
        summary: `merge into ${op.file}`,
      };
    }
    case "patchConfig": {
      const before = readDisk(appDir, op.file);
      return {
        file: op.file,
        before,
        result: patchConfig(before, op.edit),
        summary: `configure ${op.file}`,
      };
    }
    case "ensureLine": {
      const before = readDisk(appDir, op.file);
      return {
        file: op.file,
        before,
        result: ensureLine(before, op.line, op.opts),
        summary: `ensure line in ${op.file}: ${op.line}`,
      };
    }
    case "ensureImport": {
      const before = readDisk(appDir, op.file);
      return {
        file: op.file,
        before,
        result: ensureImport(before, { import: op.import, call: op.call }),
        summary: `ensure import "${op.import}" in ${op.file}`,
      };
    }
    case "setScript": {
      const before = readDisk(appDir, "package.json");
      return {
        file: "package.json",
        before,
        result: patchJson(before, { scripts: { [op.name]: op.command } }),
        summary: `set script "${op.name}"`,
      };
    }
    default:
      return null;
  }
}

/** Canonicalize (sort object keys) so the hash is stable across key ordering. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function hashPlan(plan: Plan): string {
  const { confirmToken: _omit, ...rest } = plan;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(rest)))
    .digest("hex");
}

export function buildPlan(
  pluginName: string,
  ops: Op[],
  appDir: string,
  opts: BuildPlanOptions,
): Plan {
  const steps: PlanStep[] = [];
  const packages: string[] = [];
  const dev: string[] = [];
  const commands: string[] = [];

  for (const op of ops) {
    if (op.op === "installDeps") {
      const target = op.dev ? dev : packages;
      for (const pkg of op.packages) if (!target.includes(pkg)) target.push(pkg);
      continue;
    }
    if (op.op === "run") {
      commands.push(op.cmd);
      continue;
    }

    const projected = projectFileOp(op, appDir);
    if (!projected) continue;
    // Idempotent no-op (already applied) → keep the Plan clean, drop the step.
    if (!projected.result.changed) continue;

    steps.push({
      kind: op.op,
      summary: projected.summary,
      file: projected.file,
      diff: makeDiff(projected.before, projected.result.content),
      detail: op,
    });
  }

  const declared = opts.capabilities;
  const usesInstall = packages.length > 0 || dev.length > 0;
  const usesExec = commands.length > 0;
  const usesNetwork = declared.network === true;

  const capabilities: Capability[] = [];
  if (usesInstall) capabilities.push("install");
  if (usesExec) capabilities.push("exec");
  if (usesNetwork) capabilities.push("network");

  const requiresConfirmation =
    opts.trust === "third-party" && (usesExec || usesNetwork);

  const plan: Plan = {
    plugin: pluginName,
    steps,
    installs: { packages, dev },
    commands,
    capabilities,
    warnings: opts.warnings ?? [],
    requiresConfirmation,
  };

  if (requiresConfirmation) plan.confirmToken = hashPlan(plan);
  return plan;
}
