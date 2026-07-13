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
  upsertEnv,
  wrapJsx,
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
 * An in-memory projection of file content as ops are composed sequentially:
 * multiple ops on the SAME file (e.g. two `ensureLine`s, or an `addFile`
 * followed by a `wrap`) see each other's effects — matching how `apply`
 * realizes them against disk in order. Seeded lazily from disk.
 */
class Overlay {
  private readonly content = new Map<string, string>();
  private readonly created = new Set<string>();

  constructor(private readonly appDir: string) {}

  get(file: string): string {
    const cached = this.content.get(file);
    if (cached !== undefined) return cached;
    return readDisk(this.appDir, file);
  }

  exists(file: string): boolean {
    if (this.content.has(file)) return true;
    return fs.existsSync(path.join(this.appDir, file));
  }

  set(file: string, content: string): void {
    this.content.set(file, content);
  }
}

/** A wrap op that could not resolve a target → surfaced as a manual warning. */
interface UnresolvedWrap {
  warning: string;
}

/**
 * Project a single file-mutating op against the current overlay content.
 * Returns null for ops that do not mutate a file (installs/run), or an
 * `UnresolvedWrap` for a wrap whose target could not be located.
 */
function projectFileOp(
  op: Op,
  overlay: Overlay,
):
  | { file: string; before: string; result: PatchResult; summary: string }
  | UnresolvedWrap
  | null {
  switch (op.op) {
    case "addFile": {
      const before = overlay.get(op.to);
      // Creating a new file is a change even when its content is empty.
      const changed = before !== op.content || !overlay.exists(op.to);
      return {
        file: op.to,
        before,
        result: { changed, content: op.content },
        summary: `create ${op.to}`,
      };
    }
    case "patchJson": {
      const before = overlay.get(op.file);
      return {
        file: op.file,
        before,
        result: patchJson(before, op.merge),
        summary: `merge into ${op.file}`,
      };
    }
    case "patchConfig": {
      const before = overlay.get(op.file);
      return {
        file: op.file,
        before,
        result: patchConfig(before, op.edit),
        summary: `configure ${op.file}`,
      };
    }
    case "ensureLine": {
      const before = overlay.get(op.file);
      return {
        file: op.file,
        before,
        result: ensureLine(before, op.line, op.opts),
        summary: `ensure line in ${op.file}: ${op.line}`,
      };
    }
    case "setEnv": {
      const before = overlay.get(op.file);
      return {
        file: op.file,
        before,
        result: upsertEnv(before, op.key, op.value),
        summary: `set ${op.key} in ${op.file}`,
      };
    }
    case "ensureImport": {
      const before = overlay.get(op.file);
      const what = op.import ?? op.from ?? "";
      return {
        file: op.file,
        before,
        result: ensureImport(before, {
          import: op.import,
          named: op.named,
          default: op.default,
          from: op.from,
          call: op.call,
        }),
        summary: `ensure import${what ? ` "${what}"` : ""} in ${op.file}`,
      };
    }
    case "wrap": {
      const before = overlay.get(op.file);
      const result = wrapJsx(before, op.wrappers);
      if (result.unresolved) {
        const names = op.wrappers.map((w) => w.component).join(", ");
        return {
          warning: `Could not auto-wrap ${op.file}; wrap manually with ${names}`,
        };
      }
      return {
        file: op.file,
        before,
        result,
        summary: `wrap ${op.file} in ${op.wrappers
          .map((w) => `<${w.component}>`)
          .join("")}`,
      };
    }
    case "setScript": {
      const before = overlay.get("package.json");
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

function isUnresolvedWrap(
  x: ReturnType<typeof projectFileOp>,
): x is UnresolvedWrap {
  return x !== null && "warning" in x;
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
  const warnings: string[] = [...(opts.warnings ?? [])];
  const overlay = new Overlay(appDir);

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

    const projected = projectFileOp(op, overlay);
    if (!projected) continue;
    // A wrap whose target could not be located → manual-step warning, no step.
    if (isUnresolvedWrap(projected)) {
      warnings.push(projected.warning);
      continue;
    }

    // Compose: later ops on this file see this op's result (via the overlay).
    overlay.set(projected.file, projected.result.content);

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
    warnings,
    requiresConfirmation,
  };

  if (requiresConfirmation) plan.confirmToken = hashPlan(plan);
  return plan;
}
