import { isCancel, select } from "@clack/prompts";

import { CancelledError } from "../lib/prompts.js";
import { detectCommand } from "./detect.js";
import { runCreate } from "./create.js";
import { runManage } from "./manage.js";

export interface RootMenuDeps {
  pluginsDir?: string;
  cwd?: string;
}

/**
 * The top-level menu shown when `initup` is run bare in a TTY (no args, not
 * `--json`). Routes to the create wizard, the manage wizard, or a one-shot
 * detect. Non-interactive callers never reach this — `cli.ts` keeps the
 * detect behaviour for piped / `--json` / `initup detect` invocations.
 */
export async function runRootMenu(deps: RootMenuDeps = {}): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();
  const choice = await select({
    message: "initup — what would you like to do?",
    options: [
      { value: "create", label: "Create a new project" },
      { value: "manage", label: "Manage this project" },
      { value: "detect", label: "Inspect (detect)" },
    ],
    input: process.stdin,
    output: process.stderr,
  });
  if (isCancel(choice)) throw new CancelledError();

  if (choice === "create") {
    await runCreate(undefined, { pluginsDir: deps.pluginsDir });
    return;
  }
  if (choice === "manage") {
    await runManage({ pluginsDir: deps.pluginsDir });
    return;
  }
  await detectCommand(cwd, {});
}
