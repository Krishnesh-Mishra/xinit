import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import {
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  spinner,
} from "@clack/prompts";
import type {
  ApplyResult,
  DetectedApp,
  Installer,
  Language,
  PluginManifest,
  Project,
  Runner,
} from "@initup/core";

import { appDir } from "../lib/apps.js";
import { IO } from "../lib/io.js";
import {
  listPlugins,
  pluginAppliesToApp,
  resolvePluginArg,
  resolvePluginsDir,
} from "../lib/plugins.js";
import type { ResolvedPlugin } from "../lib/plugins.js";
import {
  CancelledError,
  interactivePrompter,
  silentPrompter,
} from "../lib/prompts.js";
import type { Prompter } from "../lib/prompts.js";
import { pnpmInstaller, shellRunner } from "../lib/system.js";
import { applyPluginToApp } from "./add.js";
import { runDetect } from "./detect.js";

// ---------------------------------------------------------------------------
// Curated framework catalogue — the guided wizard's building blocks.
// ---------------------------------------------------------------------------

export interface FrameworkOption {
  /** Base plugin name (resolved against the bundled registry). */
  name: string;
  /** Human label shown in the picker. */
  label: string;
}

export interface StackCategory {
  id: string;
  label: string;
  frameworks: FrameworkOption[];
}

export interface StackGroup {
  id: string;
  label: string;
  categories: StackCategory[];
}

/**
 * The static, curated grouping of base plugins offered by `initup create`.
 * A group with a single category (Python) skips the category step in the wizard.
 */
export function frameworkChoices(): StackGroup[] {
  return [
    {
      id: "js-ts",
      label: "JavaScript / TypeScript",
      categories: [
        {
          id: "frontend",
          label: "Frontend",
          frameworks: [
            { name: "react", label: "React (Vite)" },
            { name: "nextjs", label: "Next.js" },
            { name: "vue", label: "Vue" },
            { name: "sveltekit", label: "SvelteKit" },
            { name: "react-native-expo", label: "Expo (React Native)" },
          ],
        },
        {
          id: "backend",
          label: "Backend",
          frameworks: [
            { name: "express", label: "Express" },
            { name: "nestjs", label: "NestJS" },
            { name: "fastify", label: "Fastify" },
            { name: "hono", label: "Hono" },
            { name: "bun", label: "Bun" },
          ],
        },
      ],
    },
    {
      id: "python",
      label: "Python",
      categories: [
        {
          id: "python",
          label: "Python",
          frameworks: [
            { name: "fastapi", label: "FastAPI" },
            { name: "django", label: "Django" },
            { name: "uv", label: "Plain (uv)" },
          ],
        },
      ],
    },
  ];
}

/** The app profile a base plugin scaffolds — used to filter compatible add-ons. */
type AppProfile = { framework?: string; type?: string; language: Language };

/**
 * Each base → the app profile it creates. `pluginAppliesToApp` filters the
 * registry against this profile to decide which add-ons are compatible. The
 * `type` is chosen so backend-only add-ons (appliesTo.type === "node-backend")
 * are excluded from frontend profiles and vice-versa.
 */
const BASE_PROFILES: Record<string, AppProfile> = {
  // JS/TS — Frontend
  react: { framework: "react", type: "web", language: "ts" },
  nextjs: { framework: "next", type: "web", language: "ts" },
  vue: { framework: "vue", type: "web", language: "ts" },
  sveltekit: { framework: "svelte", type: "web", language: "ts" },
  "react-native-expo": { framework: "expo", type: "mobile", language: "ts" },
  // JS/TS — Backend
  express: { framework: "express", type: "node-backend", language: "ts" },
  nestjs: { framework: "nestjs", type: "node-backend", language: "ts" },
  fastify: { framework: "fastify", type: "node-backend", language: "ts" },
  hono: { framework: "hono", type: "node-backend", language: "ts" },
  bun: { framework: "bun", type: "node-backend", language: "ts" },
  // Python
  fastapi: { framework: "fastapi", type: "python-backend", language: "python" },
  django: { framework: "django", type: "python-backend", language: "python" },
  uv: { language: "python" },
};

/** Every base plugin name in the curated catalogue. */
export function allBaseNames(): Set<string> {
  const names = new Set<string>();
  for (const g of frameworkChoices()) {
    for (const c of g.categories) {
      for (const f of c.frameworks) names.add(f.name);
    }
  }
  return names;
}

/** The app profile a base plugin scaffolds, or undefined if it isn't a base. */
export function baseProfile(baseName: string): AppProfile | undefined {
  return BASE_PROFILES[baseName];
}

/**
 * Given a chosen base plugin, list the compatible **add-on** plugins from the
 * registry. Maps the base → the app profile it creates, then filters with the
 * shared `pluginAppliesToApp`. Other base/new-app plugins and the base itself
 * are excluded (they scaffold apps, they don't augment one).
 */
export function compatibleAddons(
  baseName: string,
  registry: ResolvedPlugin[],
): string[] {
  const profile = BASE_PROFILES[baseName];
  if (!profile) return [];
  const bases = allBaseNames();
  const out: string[] = [];
  for (const p of registry) {
    const name = p.manifest.name;
    if (name === baseName) continue;
    if (bases.has(name)) continue;
    // Defensive: never offer another new-app scaffolder as an add-on.
    if (p.manifest.appliesTo?.type === "new-app") continue;
    if (!pluginAppliesToApp(p.manifest, profile)) continue;
    out.push(name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export interface CreateFlags {
  dir?: string;
  json?: boolean;
  silent?: boolean;
  yes?: boolean;
  pluginsDir?: string;
  /** Non-interactive: comma-separated add-on plugin names. */
  addons?: string;
}

/** The user's resolved choices: which base to scaffold + which add-ons. */
export interface Selection {
  base: string;
  addons: string[];
}

export interface WizardContext {
  io: IO;
  registry: ResolvedPlugin[];
  cwd: string;
  targetDir: string;
  flags: CreateFlags;
}

/** Produces a selection, or null when the user declines to scaffold. */
export type Wizard = (ctx: WizardContext) => Promise<Selection | null>;

export interface CreateDeps {
  io?: IO;
  cwd?: string;
  installer?: Installer;
  runner?: Runner;
  prompter?: Prompter;
  /** Override the selection step (tests / non-interactive callers). */
  wizard?: Wizard;
}

export interface CreateResult {
  status: "success" | "rolled_back" | "cancelled";
  /** The plugins applied, in order, with their individual results. */
  applied: { plugin: string; result: ApplyResult }[];
}

const CLACK = { input: process.stdin, output: process.stderr } as const;

function displayLabel(name: string, registry: ResolvedPlugin[]): string {
  const found = registry.find((p) => p.manifest.name === name);
  return found?.manifest.displayName ?? name;
}

function frameworkLabel(baseName: string): string {
  for (const g of frameworkChoices()) {
    for (const c of g.categories) {
      for (const f of c.frameworks) if (f.name === baseName) return f.label;
    }
  }
  return baseName;
}

async function pickOne(
  message: string,
  options: { value: string; label: string }[],
): Promise<string> {
  const v = await select({ message, options, ...CLACK });
  if (isCancel(v)) throw new CancelledError();
  return v as string;
}

/**
 * The default interactive wizard: stack → (category) → framework → add-ons →
 * target-dir confirm → summary → final "Scaffold now?" confirm. The final
 * confirm IS the consent, so the caller auto-approves each selected plugin.
 */
export const interactiveWizard: Wizard = async (ctx) => {
  const { io, registry, targetDir } = ctx;
  const groups = frameworkChoices();

  intro("initup — create a new project");

  const stackId = await pickOne(
    "Which stack?",
    groups.map((g) => ({ value: g.id, label: g.label })),
  );
  const group = groups.find((g) => g.id === stackId)!;

  let category: StackCategory;
  if (group.categories.length === 1) {
    category = group.categories[0]!;
  } else {
    const catId = await pickOne(
      "Frontend or backend?",
      group.categories.map((c) => ({ value: c.id, label: c.label })),
    );
    category = group.categories.find((c) => c.id === catId)!;
  }

  const base = await pickOne(
    "Which framework?",
    category.frameworks.map((f) => ({ value: f.name, label: f.label })),
  );

  const addonNames = compatibleAddons(base, registry);
  let addons: string[] = [];
  if (addonNames.length > 0) {
    const picked = await multiselect({
      message: "Optional add-ons (space to toggle, enter to confirm)",
      options: addonNames.map((n) => ({
        value: n,
        label: displayLabel(n, registry),
      })),
      required: false,
      ...CLACK,
    });
    if (isCancel(picked)) throw new CancelledError();
    addons = picked as string[];
  }

  // Warn before scaffolding into a directory that already holds a project.
  const existing = await runDetect(targetDir);
  const occupied = existing.apps.length > 0 || existing.packages.length > 0;
  if (occupied) {
    const proceed = await confirm({
      message: `${targetDir} already contains a project. Scaffold into it anyway?`,
      initialValue: false,
      ...CLACK,
    });
    if (isCancel(proceed)) throw new CancelledError();
    if (!proceed) return null;
  }

  const summary = [
    `Target:  ${targetDir}`,
    `Base:    ${frameworkLabel(base)}`,
    `Add-ons: ${addons.length ? addons.map((n) => displayLabel(n, registry)).join(", ") : "none"}`,
  ].join("\n");
  note(summary, "Plan");

  const go = await confirm({
    message: "Scaffold now?",
    initialValue: true,
    ...CLACK,
  });
  if (isCancel(go)) throw new CancelledError();
  if (!go) {
    io.info(io.c.dim("Nothing scaffolded."));
    return null;
  }

  return { base, addons };
};

/** Build a selection from flags/args without any prompting (--json/--silent). */
function nonInteractiveSelection(
  baseArg: string | undefined,
  flags: CreateFlags,
  registry: ResolvedPlugin[],
): Selection {
  if (!baseArg) {
    throw new Error(
      "Non-interactive create needs a base template, e.g. `initup create react`. " +
        "Run without --json/--silent to use the interactive wizard.",
    );
  }
  if (!BASE_PROFILES[baseArg]) {
    throw new Error(
      `Unknown base "${baseArg}". Known: ${[...allBaseNames()].join(", ")}.`,
    );
  }
  const requested = (flags.addons ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const compatible = new Set(compatibleAddons(baseArg, registry));
  for (const a of requested) {
    if (!compatible.has(a)) {
      throw new Error(
        `Add-on "${a}" is not compatible with "${baseArg}". ` +
          `Compatible: ${[...compatible].join(", ") || "none"}.`,
      );
    }
  }
  return { base: baseArg, addons: requested };
}

/** Seed the minimal project file a patch-based base needs to apply into. */
async function seedProject(
  targetDir: string,
  language: Language,
  manifest: PluginManifest,
): Promise<void> {
  // create-CLI bases (create-next-app / create-expo-app / …) scaffold the whole
  // tree themselves — seeding would collide with their generators.
  if (manifest.capabilities.exec) return;

  const name = path.basename(targetDir) || "app";
  if (language === "python") {
    const py = path.join(targetDir, "pyproject.toml");
    if (!fs.existsSync(py)) {
      await fsp.writeFile(
        py,
        `[project]\nname = "${name}"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = []\n`,
      );
    }
    return;
  }
  const pkg = path.join(targetDir, "package.json");
  if (!fs.existsSync(pkg)) {
    await fsp.writeFile(
      pkg,
      JSON.stringify({ name, private: true, type: "module" }, null, 2) + "\n",
    );
  }
}

/** Resolve a Project + target app for the dir, synthesising one if detect finds none. */
async function projectForDir(
  targetDir: string,
  language: Language,
): Promise<{ project: Project; app: DetectedApp }> {
  const project = await runDetect(targetDir);
  const app =
    project.apps[0] ??
    ({
      name: path.basename(targetDir) || "app",
      path: ".",
      language,
      plugins: [],
    } satisfies DetectedApp);
  return { project, app };
}

/**
 * A no-noise IO for per-step applies: suppresses every stdout write (including
 * the per-plugin JSON result) so spinners aren't corrupted and, in `--json`
 * mode, `runCreate` remains the single JSON payload on stdout. Errors still go
 * to stderr.
 */
class QuietIO extends IO {
  override info(): void {}
  override note(): void {}
  override warn(): void {}
  override result(): void {}
}

/**
 * `initup create [base]` — the guided wizard. Selects a base + add-ons, seeds a
 * minimal project, then applies the base plugin first and each add-on in order.
 * Selection, installer, runner and prompter are all injectable for testing.
 */
export async function runCreate(
  baseArg: string | undefined,
  flags: CreateFlags,
  deps: CreateDeps = {},
): Promise<CreateResult> {
  const io = deps.io ?? new IO({ json: flags.json, silent: flags.silent });
  const cwd = deps.cwd ?? process.cwd();
  const nonInteractive = io.json || io.silent;
  const pluginsDir = resolvePluginsDir(flags.pluginsDir);
  const registry = listPlugins(pluginsDir);
  const targetDir = path.resolve(cwd, flags.dir ?? ".");

  // --- 1. Resolve the selection ---
  // An explicit base (or --json/--silent) scaffolds directly; only a bare,
  // interactive `initup create` opens the guided wizard. The wizard's final
  // confirm is the consent, so wizard-driven runs auto-approve; an explicit
  // base honours --yes like `initup add`.
  const usedWizard = !!deps.wizard || (!baseArg && !nonInteractive);
  let selection: Selection | null;
  if (deps.wizard) {
    selection = await deps.wizard({ io, registry, cwd, targetDir, flags });
  } else if (baseArg || nonInteractive) {
    selection = nonInteractiveSelection(baseArg, flags, registry);
  } else {
    selection = await interactiveWizard({ io, registry, cwd, targetDir, flags });
  }
  if (!selection) return { status: "cancelled", applied: [] };

  const { base, addons } = selection;
  const profile = BASE_PROFILES[base];
  if (!profile) {
    throw new Error(
      `Unknown base "${base}". Known: ${[...allBaseNames()].join(", ")}.`,
    );
  }

  // --- 2. Seed the target directory ---
  const baseResolved = resolvePluginArg(base, pluginsDir);
  await fsp.mkdir(targetDir, { recursive: true });
  await seedProject(targetDir, profile.language, baseResolved.manifest);

  // --- 3. Apply base first, then each add-on in order ---
  const applyFlags = {
    json: flags.json,
    silent: flags.silent,
    yes: usedWizard ? true : flags.yes,
  };
  const prompter: Prompter =
    deps.prompter ?? (nonInteractive ? silentPrompter : interactivePrompter);
  const installer = deps.installer ?? pnpmInstaller;
  const runner = deps.runner ?? shellRunner;
  const useSpinner = !nonInteractive && !deps.wizard && !!process.stderr.isTTY;
  // Sub-steps stay quiet when a spinner narrates them or when stdout must carry
  // only the aggregate JSON; otherwise they print their own concise ✓ summary.
  const quietIo = new QuietIO({ json: flags.json, silent: flags.silent });
  const stepIo = useSpinner || io.json ? quietIo : io;

  const applied: CreateResult["applied"] = [];
  let status: CreateResult["status"] = "success";

  for (const name of [base, ...addons]) {
    const resolved = resolvePluginArg(name, pluginsDir);
    const { project, app } = await projectForDir(targetDir, profile.language);
    const label = displayLabel(name, registry);

    const s = useSpinner ? spinner() : undefined;
    if (s) s.start(`Setting up ${label}`);
    else if (!io.json) io.info(io.c.cyan(`▸ ${label}  (${appDir(project, app)})`));

    const result = await applyPluginToApp({
      resolved,
      project,
      app,
      flags: applyFlags,
      io: stepIo,
      installer,
      runner,
      prompter,
    });

    if (s) {
      s.stop(
        result.status === "success"
          ? `${io.c.green("✓")} ${label}`
          : result.status === "rolled_back"
            ? `${io.c.red("✗")} ${label} — rolled back`
            : `${io.c.yellow("…")} ${label} — needs confirmation`,
      );
    }

    applied.push({ plugin: name, result });
    if (result.status !== "success") {
      status = "rolled_back";
      io.error(
        `Stopped: ${label} did not complete (${result.status}). ` +
          `${applied.length - 1} step(s) applied before it.`,
      );
      break;
    }
  }

  if (!nonInteractive && status === "success") {
    outro(
      `Done. cd ${path.relative(cwd, targetDir) || "."} and start building — ` +
        `run \`initup manage\` to add more.`,
    );
  }
  if (io.json) io.result({ status, applied });

  return { status, applied };
}
