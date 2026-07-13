import { exec } from "node:child_process";
import { promisify } from "node:util";

import { installCommands, type Installer, type Runner } from "@xinit/core";

const execP = promisify(exec);

/**
 * Real installer: builds the manager-appropriate install command(s) via
 * `installCommands` (pnpm add / uv add / poetry add / …) and shells each in the
 * app directory. Batched by the core (one prod + one dev command), and
 * workspace-aware because it runs with `cwd` set to the target app. Runs through
 * a shell so the manager's `.cmd`/`.exe` shim resolves on Windows.
 */
export const pnpmInstaller: Installer = async (
  appDir,
  { deps, devDeps, manager },
) => {
  for (const cmd of installCommands(manager ?? "pnpm", deps, devDeps)) {
    await execP(cmd, { cwd: appDir });
  }
};

/**
 * Real runner for `ctx.run` exec commands. The command is an opaque string
 * (weak-guarantee op, SPEC §5), so it goes through a shell in the app directory.
 */
export const shellRunner: Runner = async (appDir, cmd) => {
  await execP(cmd, { cwd: appDir });
};
