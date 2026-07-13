import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Installer, Runner } from "@xinit/core";

const execFileP = promisify(execFile);
const execP = promisify(exec);

/** pnpm is a `.cmd` shim on Windows; execFile needs the exact binary name. */
const PNPM = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/**
 * Real installer: shells `pnpm add` / `pnpm add -D` in the app directory.
 * Batched by the core (one prod + one dev call), workspace-aware because it runs
 * with `cwd` set to the target app so pnpm picks the right workspace package.
 */
export const pnpmInstaller: Installer = async (appDir, { deps, devDeps }) => {
  if (deps.length > 0) {
    await execFileP(PNPM, ["add", ...deps], { cwd: appDir });
  }
  if (devDeps.length > 0) {
    await execFileP(PNPM, ["add", "-D", ...devDeps], { cwd: appDir });
  }
};

/**
 * Real runner for `ctx.run` exec commands. The command is an opaque string
 * (weak-guarantee op, SPEC §5), so it goes through a shell in the app directory.
 */
export const shellRunner: Runner = async (appDir, cmd) => {
  await execP(cmd, { cwd: appDir });
};
