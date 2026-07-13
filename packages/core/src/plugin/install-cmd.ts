/**
 * Manager-aware install-command builder (SPEC §5, §10).
 *
 * Given a detected package manager and the resolved dependency lists, produce the
 * shell command(s) that install them — one for prod deps, one for dev deps. This
 * is the single place that knows each manager's install syntax, so both the CLI
 * and MCP installers (and the core default) stay dumb string-runners.
 *
 * Managers that have no prod/dev split (pip) emit a plain install for both lists.
 * Empty dep lists are skipped. An unknown manager (or a compound like
 * `"pnpm+turbo"`) is normalized to its base tool, defaulting to pnpm.
 */

interface ManagerCmds {
  /** Command prefix for production dependencies, e.g. `"pnpm add"`. */
  add: string;
  /** Command prefix for development dependencies, e.g. `"pnpm add -D"`. */
  addDev: string;
}

const TABLE: Record<string, ManagerCmds> = {
  pnpm: { add: "pnpm add", addDev: "pnpm add -D" },
  npm: { add: "npm install", addDev: "npm install -D" },
  yarn: { add: "yarn add", addDev: "yarn add -D" },
  bun: { add: "bun add", addDev: "bun add -d" },
  uv: { add: "uv add", addDev: "uv add --dev" },
  poetry: { add: "poetry add", addDev: "poetry add --group dev" },
  // pip has no dev/prod split — both buckets install the same way.
  pip: { add: "pip install", addDev: "pip install" },
};

/**
 * Normalize a manager string to its base tool: strips a compound suffix
 * (`"pnpm+turbo"` → `"pnpm"`) and lowercases. Unknown/empty ⇒ `"pnpm"` default.
 */
function baseManager(manager: string): string {
  const base = (manager.split("+")[0] ?? "").trim().toLowerCase();
  return base in TABLE ? base : "pnpm";
}

/**
 * Build the install command(s) for `manager`.
 * @example installCommands("uv", ["httpx"], []) // → ["uv add httpx"]
 * @example installCommands("pnpm", ["react"], ["vite"]) // → ["pnpm add react", "pnpm add -D vite"]
 */
export function installCommands(
  manager: string,
  deps: string[],
  devDeps: string[],
): string[] {
  const cmds = TABLE[baseManager(manager)]!;
  const out: string[] = [];
  if (deps.length > 0) out.push(`${cmds.add} ${deps.join(" ")}`);
  if (devDeps.length > 0) out.push(`${cmds.addDev} ${devDeps.join(" ")}`);
  return out;
}
