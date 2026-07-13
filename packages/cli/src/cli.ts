import { cac } from "cac";
import pc from "picocolors";

import { runAdd } from "./commands/add.js";
import { runCreate } from "./commands/create.js";
import { detectCommand } from "./commands/detect.js";
import { runDoctor } from "./commands/doctor.js";
import { runManage } from "./commands/manage.js";
import { runRootMenu } from "./commands/menu.js";
import { runMake } from "./commands/make.js";
import { runPack } from "./commands/pack.js";
import { CancelledError } from "./lib/prompts.js";

const VERSION = "1.0.0";

/**
 * Run a command action with uniform error handling and output discipline:
 * failures print `{ "status": "error", ... }` to stdout in JSON mode (so stdout
 * stays valid JSON) or a coloured line to stderr otherwise, and exit non-zero.
 */
async function guard(jsonMode: boolean, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof CancelledError) {
      // User aborted an interactive prompt — not an error condition.
      process.stderr.write(pc.dim("Cancelled.\n"));
      process.exitCode = 130;
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (jsonMode) {
      process.stdout.write(JSON.stringify({ status: "error", message }) + "\n");
    } else {
      process.stderr.write(pc.red(`Error: ${message}`) + "\n");
    }
    process.exitCode = 1;
  }
}

const cli = cac("initup");

// initup — a top-level menu in an interactive TTY; otherwise detect (so agents,
// pipes and `--json` always get the Project model unchanged).
cli
  .command("[dir]", "Detect the project, or open the menu when run bare in a TTY")
  .option("--json", "Output the Project model as JSON")
  .action((dir: string | undefined, options: { json?: boolean }) => {
    const menu = !dir && !options.json && !!process.stdout.isTTY;
    if (menu) return guard(false, () => runRootMenu());
    return guard(!!options.json, () =>
      detectCommand(process.cwd(), { json: options.json }),
    );
  });

cli
  .command("detect", "Detect the project and print its model")
  .option("--json", "Output the Project model as JSON")
  .action((options: { json?: boolean }) =>
    guard(!!options.json, () => detectCommand(process.cwd(), { json: options.json })),
  );

// initup add <plugin>
cli
  .command("add <plugin>", "Add/configure a plugin in an app")
  .option("--app <name>", "Target app (defaults to the single app, else prompts)")
  .option("--plugins-dir <dir>", "Directory of available plugins")
  .option("--answers <json>", "Preset prompt answers as a JSON object")
  .option("--json", "Machine-readable output (stdout is JSON only)")
  .option("--silent", "No prompts; use defaults (requires all answers)")
  .option("--yes", "Auto-approve the consent handshake")
  .action(
    (
      plugin: string,
      options: {
        app?: string;
        pluginsDir?: string;
        answers?: string;
        json?: boolean;
        silent?: boolean;
        yes?: boolean;
      },
    ) =>
      guard(!!options.json, async () => {
        const result = await runAdd(plugin, {
          app: options.app,
          pluginsDir: options.pluginsDir,
          answers: options.answers,
          json: options.json,
          silent: options.silent,
          yes: options.yes,
        });
        if (result.status === "rolled_back") process.exitCode = 1;
      }),
  );

// initup manage — interactive wizard.
cli
  .command("manage", "Interactively manage apps and their plugins")
  .option("--plugins-dir <dir>", "Directory of available plugins")
  .action((options: { pluginsDir?: string }) =>
    guard(false, () => runManage({ pluginsDir: options.pluginsDir })),
  );

// initup create [base] — the guided new-project wizard.
cli
  .command("create [base]", "Create a new project (interactive wizard)")
  .option("--dir <path>", "Target directory (default: cwd)")
  .option("--addons <list>", "Comma-separated add-on plugins (non-interactive)")
  .option("--plugins-dir <dir>", "Directory of available plugins")
  .option("--json", "Machine-readable output (stdout is JSON only)")
  .option("--silent", "No prompts; requires a base template")
  .option("--yes", "Auto-approve the consent handshake")
  .action(
    (
      base: string | undefined,
      options: {
        dir?: string;
        addons?: string;
        pluginsDir?: string;
        json?: boolean;
        silent?: boolean;
        yes?: boolean;
      },
    ) =>
      guard(!!options.json, async () => {
        const result = await runCreate(base, {
          dir: options.dir,
          addons: options.addons,
          pluginsDir: options.pluginsDir,
          json: options.json,
          silent: options.silent,
          yes: options.yes,
        });
        if (result.status === "rolled_back") process.exitCode = 1;
      }),
  );

// initup doctor
cli
  .command("doctor", "Report project health (does not fix in v1)")
  .option("--json", "Output the report as JSON")
  .action((options: { json?: boolean }) =>
    guard(!!options.json, () => runDoctor(process.cwd(), { json: options.json }).then(() => {})),
  );

// initup pack <dir>
cli
  .command("pack <dir>", "Pack a plugin folder into a single JSON")
  .option("--out <file>", "Output file (default: <name>.json)")
  .option("--json", "Machine-readable output (stdout is JSON only)")
  .action((dir: string, options: { out?: string; json?: boolean }) =>
    guard(!!options.json, () =>
      runPack(dir, { out: options.out, json: options.json }).then(() => {}),
    ),
  );

// initup make <entry> — compile a typed plugin.ts (or folder) → single JSON.
cli
  .command("make <entry>", "Compile a typed plugin.ts (or folder) into a single JSON")
  .option("--out <file>", "Output file (default: <name>.json)")
  .option("--json", "Machine-readable output (stdout is JSON only)")
  .action((entry: string, options: { out?: string; json?: boolean }) =>
    guard(!!options.json, () =>
      runMake(entry, { out: options.out, json: options.json }).then(() => {}),
    ),
  );

cli.help();
cli.version(VERSION);

cli.parse();
