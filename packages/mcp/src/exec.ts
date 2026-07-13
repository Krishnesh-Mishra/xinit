/**
 * Real effect handlers for the MCP layer.
 *
 * `addPlugin` in core keeps all business logic; it just needs an `Installer`
 * and a `Runner` to actually touch the machine. Here we provide shell-backed
 * implementations (SPEC §8: "a real installer — shell `pnpm add` — and runner").
 * Both are injectable, so unit tests substitute mocks and never hit the network.
 */
import { spawn } from "node:child_process";

import { installCommands, type Installer, type Runner } from "@xinit/core";

/** Spawn a command through the platform shell, rejecting on a non-zero exit. */
function shell(cmd: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd, shell: true, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`\`${cmd}\` exited with code ${code}`)),
    );
  });
}

/**
 * Manager-aware installer: builds the install command(s) via `installCommands`
 * (pnpm add / uv add / poetry add / …) from the app's detected manager and
 * shells each in the app directory.
 */
export const shellInstaller: Installer = async (
  appDir,
  { deps, devDeps, manager },
) => {
  for (const cmd of installCommands(manager ?? "pnpm", deps, devDeps)) {
    await shell(cmd, appDir);
  }
};

/** Exec runner for `ctx.run` commands (weak-guarantee ops — SPEC §5). */
export const shellRunner: Runner = (appDir, cmd) => shell(cmd, appDir);
