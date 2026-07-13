/**
 * Real effect handlers for the MCP layer.
 *
 * `addPlugin` in core keeps all business logic; it just needs an `Installer`
 * and a `Runner` to actually touch the machine. Here we provide shell-backed
 * implementations (SPEC §8: "a real installer — shell `pnpm add` — and runner").
 * Both are injectable, so unit tests substitute mocks and never hit the network.
 */
import { spawn } from "node:child_process";

import type { Installer, Runner } from "@xinit/core";

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

/** Escape a package spec for safe interpolation into a shell command line. */
function quote(pkg: string): string {
  return `"${pkg.replace(/(["\\$`])/g, "\\$1")}"`;
}

/** Workspace-friendly installer: `pnpm add` for prod deps, `pnpm add -D` for dev. */
export const shellInstaller: Installer = async (appDir, { deps, devDeps }) => {
  if (deps.length > 0) {
    await shell(`pnpm add ${deps.map(quote).join(" ")}`, appDir);
  }
  if (devDeps.length > 0) {
    await shell(`pnpm add -D ${devDeps.map(quote).join(" ")}`, appDir);
  }
};

/** Exec runner for `ctx.run` commands (weak-guarantee ops — SPEC §5). */
export const shellRunner: Runner = (appDir, cmd) => shell(cmd, appDir);
