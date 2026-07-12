/**
 * Package-manager fingerprinting from lockfiles / manifests.
 *
 * JS lockfiles win over Python when both are present (a JS-managed monorepo may
 * still contain Python apps, which detection reports separately). `+turbo` is
 * appended when a JS toolchain also carries a turbo.json.
 */
import * as path from "node:path";
import { existsFile } from "./fs-utils.js";

export interface ManagerInfo {
  /** e.g. "pnpm" | "npm+turbo" | "uv" | "unknown". */
  manager: string;
  hasJs: boolean;
  hasPython: boolean;
  /** true when the manager was inferred without a definitive lockfile. */
  guessed: boolean;
}

export function detectManager(root: string): ManagerInfo {
  const has = (f: string): boolean => existsFile(path.join(root, f));
  const hasPkg = has("package.json");

  let jsManager: string | undefined;
  let jsGuessed = false;
  if (has("pnpm-lock.yaml")) jsManager = "pnpm";
  else if (has("yarn.lock")) jsManager = "yarn";
  else if (has("bun.lockb") || has("bun.lock")) jsManager = "bun";
  else if (has("package-lock.json")) jsManager = "npm";
  else if (hasPkg) {
    // package.json but no lockfile — npm is the safe default, but it's a guess.
    jsManager = "npm";
    jsGuessed = true;
  }
  const hasJs = hasPkg || jsManager !== undefined;

  let pyManager: string | undefined;
  if (has("uv.lock")) pyManager = "uv";
  else if (has("poetry.lock")) pyManager = "poetry";
  else if (has("requirements.txt") || has("pyproject.toml")) pyManager = "pip";
  const hasPython = pyManager !== undefined;

  let manager: string;
  let guessed: boolean;
  if (jsManager !== undefined) {
    manager = jsManager;
    guessed = jsGuessed;
  } else if (pyManager !== undefined) {
    // pip has no lockfile of its own; presence of pyproject/requirements is
    // definitive enough that we don't treat it as a guess.
    manager = pyManager;
    guessed = false;
  } else {
    manager = "unknown";
    guessed = true;
  }

  if (jsManager !== undefined && has("turbo.json")) manager += "+turbo";

  return { manager, hasJs, hasPython, guessed };
}
