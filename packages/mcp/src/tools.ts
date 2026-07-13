/**
 * initup MCP tool handlers (SPEC §8).
 *
 * Every handler is a thin, independently-testable async function that marshals
 * arguments into a single call to `@initup/core` and returns a plain JSON result.
 * `registerTools` wraps each one for the MCP transport (JSON in the `content`
 * result, errors surfaced as `isError`). No business logic lives here — the core
 * owns determinism, idempotency, transactions and the consent gate.
 */
import * as path from "node:path";

import {
  addPlugin,
  detect,
  type AddPluginOptions,
  type Answers,
  type ApplyResult,
  type Installer,
  type Plan,
  type Project,
  type Runner,
  type Trust,
} from "@initup/core";

import {
  findBundledPluginDir,
  listBundledPlugins,
  looksLikePath,
  resolvePluginsDir,
  type PluginSummary,
} from "./plugins.js";
import { shellInstaller, shellRunner } from "./exec.js";

/** Injectable dependencies (tests substitute installer/runner + a plugins dir). */
export interface ToolDeps {
  /** Repo `plugins/` directory. Defaults to auto-resolution. */
  pluginsDir?: string;
  installer?: Installer;
  runner?: Runner;
}

// --- detect_project ---------------------------------------------------------

export interface DetectArgs {
  root?: string;
}

export async function detectTool(args: DetectArgs = {}): Promise<Project> {
  const root = args.root ? path.resolve(args.root) : process.cwd();
  return detect(root);
}

// --- list_plugins / search_plugins -----------------------------------------

/** Agent-facing plugin card (drops the internal absolute `dir`). */
type PluginCard = Omit<PluginSummary, "dir">;

function toCard({ dir: _dir, ...rest }: PluginSummary): PluginCard {
  return rest;
}

/**
 * A plugin is language-compatible when it declares no `languages` restriction,
 * or the requested `language` is in its list. No language requested ⇒ no filter.
 */
function languageCompatible(p: PluginSummary, language?: string): boolean {
  if (!language || !p.languages) return true;
  return (p.languages as string[]).includes(language);
}

export interface ListArgs {
  /** Optional target app language; excludes plugins that don't support it. */
  language?: string;
}

export function listPluginsTool(
  args: ListArgs = {},
  deps: ToolDeps = {},
): { plugins: PluginCard[] } {
  const pluginsDir = deps.pluginsDir ?? resolvePluginsDir();
  return {
    plugins: listBundledPlugins(pluginsDir)
      .filter((p) => languageCompatible(p, args.language))
      .map(toCard),
  };
}

export interface SearchArgs {
  query: string;
  /** Optional target app language; excludes plugins that don't support it. */
  language?: string;
}

export function searchPluginsTool(
  args: SearchArgs,
  deps: ToolDeps = {},
): { query: string; plugins: PluginCard[] } {
  const pluginsDir = deps.pluginsDir ?? resolvePluginsDir();
  const q = args.query.trim().toLowerCase();
  const plugins = listBundledPlugins(pluginsDir)
    .filter(
      (p) =>
        (p.name.toLowerCase().includes(q) ||
          p.displayName.toLowerCase().includes(q)) &&
        languageCompatible(p, args.language),
    )
    .map(toCard);
  return { query: args.query, plugins };
}

// --- add_plugin (with the SPEC §8 consent handshake) -----------------------

export interface AddPluginArgs {
  /** A bundled plugin name, or a filesystem path to an authored plugin folder. */
  plugin: string;
  /** App directory to mutate (defaults to cwd). */
  app?: string;
  answers?: Answers;
  /** Consent token from a prior `confirmation_required` response. */
  confirm?: string;
}

/** A confirmation-required response: the plan preview + the replay-proof token. */
export interface ConfirmationRequired {
  status: "confirmation_required";
  plugin: string;
  trust: Trust;
  message: string;
  confirmToken: string;
  capabilities: Plan["capabilities"];
  plan: {
    fileChanges: { file?: string; summary: string; diff?: string }[];
    installs: Plan["installs"];
    commands: string[];
  };
}

function summarizePlan(plan: Plan): ConfirmationRequired["plan"] {
  return {
    fileChanges: plan.steps.map((s) => ({
      file: s.file,
      summary: s.summary,
      diff: s.diff,
    })),
    installs: plan.installs,
    commands: plan.commands,
  };
}

export type AddPluginResult = ApplyResult | ConfirmationRequired;

export async function addPluginTool(
  args: AddPluginArgs,
  deps: ToolDeps = {},
): Promise<AddPluginResult> {
  const appDir = args.app ? path.resolve(args.app) : process.cwd();

  // Resolve the plugin reference + its trust level (SPEC §8):
  //  - a pasted path/URL  ⇒ third-party (consent gate applies to exec/network)
  //  - a bundled name     ⇒ first-party (runs immediately)
  let pluginDir: string;
  let trust: Trust;
  if (looksLikePath(args.plugin)) {
    pluginDir = path.resolve(args.plugin);
    trust = "third-party";
  } else {
    const pluginsDir = deps.pluginsDir ?? resolvePluginsDir();
    const found = findBundledPluginDir(pluginsDir, args.plugin);
    if (!found) {
      throw new Error(
        `Unknown plugin "${args.plugin}". Use list_plugins to see bundled ` +
          `plugins, or pass a path to an authored plugin folder.`,
      );
    }
    pluginDir = found;
    trust = "first-party";
  }

  const opts: AddPluginOptions = {
    pluginDirOrManifest: pluginDir,
    appDir,
    answers: args.answers,
    trust,
    confirm: args.confirm,
    installer: deps.installer ?? shellInstaller,
    runner: deps.runner ?? shellRunner,
  };

  const result = await addPlugin(opts);

  // Consent handshake: hand the plan + token back to the agent, run nothing.
  if (result.status === "confirmation_required") {
    const plan = result.plan;
    const token = result.confirmToken;
    if (!plan || !token) {
      // Should never happen — core sets both together.
      throw new Error("confirmation required but no plan/token was returned");
    }
    return {
      status: "confirmation_required",
      plugin: result.plugin,
      trust,
      message:
        `"${result.plugin}" is a ${trust} plugin that needs ` +
        `${plan.capabilities.join(" + ")} capabilities. Review the plan, then ` +
        `re-call add_plugin with the same arguments plus confirm: "${token}".`,
      confirmToken: token,
      capabilities: plan.capabilities,
      plan: summarizePlan(plan),
    };
  }

  return result;
}

// --- doctor -----------------------------------------------------------------

export interface RootArgs {
  root?: string;
}

export interface DoctorReport {
  root: string;
  kind: Project["kind"];
  manager: string;
  confidence: number;
  apps: {
    name: string;
    path: string;
    language: string;
    framework?: string;
    plugins: string[];
  }[];
  detectedPlugins: string[];
  warnings: string[];
}

export async function doctorTool(args: RootArgs = {}): Promise<DoctorReport> {
  const project = await detectTool(args);

  const detectedPlugins = [
    ...new Set(project.apps.flatMap((a) => a.plugins)),
  ].sort();

  const warnings: string[] = [];
  if (project.confidence < 0.5) {
    warnings.push(
      `Low detection confidence (${project.confidence}). Verify the project ` +
        `manager and frameworks before mutating.`,
    );
  }
  if (project.apps.length === 0) {
    warnings.push("No applications were detected under the project root.");
  }
  for (const app of project.apps) {
    if (!app.framework) {
      warnings.push(`App "${app.name}" has no recognized framework.`);
    }
  }

  return {
    root: project.root,
    kind: project.kind,
    manager: project.manager,
    confidence: project.confidence,
    apps: project.apps.map((a) => ({
      name: a.name,
      path: a.path,
      language: a.language,
      framework: a.framework,
      plugins: a.plugins,
    })),
    detectedPlugins,
    warnings,
  };
}

// --- get_graph --------------------------------------------------------------

export interface GraphNode {
  id: string;
  type: "repo" | "app" | "package" | "framework" | "plugin";
  label: string;
}
export interface GraphEdge {
  from: string;
  to: string;
  kind: "contains" | "framework" | "plugin";
}
export interface DependencyGraph {
  root: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getGraphTool(args: RootArgs = {}): Promise<DependencyGraph> {
  const project = await detectTool(args);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const addNode = (n: GraphNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };

  addNode({ id: "repo", type: "repo", label: project.root });

  const addUnit = (
    unit: Project["apps"][number],
    type: "app" | "package",
  ): void => {
    const id = `${type}:${unit.name}`;
    addNode({ id, type, label: unit.name });
    edges.push({ from: "repo", to: id, kind: "contains" });

    if (unit.framework) {
      const fwId = `framework:${unit.framework}`;
      addNode({ id: fwId, type: "framework", label: unit.framework });
      edges.push({ from: id, to: fwId, kind: "framework" });
    }
    for (const plugin of unit.plugins) {
      const pId = `plugin:${plugin}`;
      addNode({ id: pId, type: "plugin", label: plugin });
      edges.push({ from: id, to: pId, kind: "plugin" });
    }
  };

  for (const app of project.apps) addUnit(app, "app");
  for (const pkg of project.packages) addUnit(pkg, "package");

  return { root: project.root, nodes, edges };
}
