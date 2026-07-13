import * as path from "node:path";

import { isCancel, select } from "@clack/prompts";
import type { DetectedApp, Project } from "@initup/core";

import { CancelledError } from "./prompts.js";

export interface SelectAppOptions {
  /** Explicit `--app <name>` selection. */
  appName?: string;
  /** Whether interactive selection is permitted (false in --json/--silent). */
  allowPrompt: boolean;
}

/**
 * Choose the target app for an operation:
 * - `--app <name>` selects by name (error if unknown),
 * - a single-app project uses its only app,
 * - otherwise prompt (human mode) or error (non-interactive).
 */
export async function selectApp(
  project: Project,
  opts: SelectAppOptions,
): Promise<DetectedApp> {
  const apps = project.apps;
  if (apps.length === 0) throw new Error("No apps detected in this project.");

  if (opts.appName) {
    const match = apps.find((a) => a.name === opts.appName);
    if (!match) {
      throw new Error(
        `App "${opts.appName}" not found. Available: ${apps.map((a) => a.name).join(", ")}.`,
      );
    }
    return match;
  }

  if (apps.length === 1) return apps[0]!;

  if (!opts.allowPrompt) {
    throw new Error(
      `Multiple apps detected; pass --app <name>. Available: ${apps.map((a) => a.name).join(", ")}.`,
    );
  }

  const choice = await select({
    message: "Which app?",
    options: apps.map((a) => ({ value: a.name, label: `${a.name} (${a.path})` })),
    input: process.stdin,
    output: process.stderr,
  });
  if (isCancel(choice)) throw new CancelledError();
  return apps.find((a) => a.name === choice)!;
}

/** Absolute directory of an app within its project. */
export function appDir(project: Project, app: DetectedApp): string {
  return path.resolve(project.root, app.path);
}
