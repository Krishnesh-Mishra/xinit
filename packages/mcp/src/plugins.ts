/**
 * Bundled reference-plugin discovery for the MCP layer.
 *
 * `list_plugins` / `search_plugins` enumerate the repo `plugins/` directory, and
 * `add_plugin` resolves a bundled plugin *name* to its authored folder. All of
 * this leans on core's `loadRegistry` — the MCP layer only locates the directory
 * and marshals the manifest fields the agent cares about.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { isPluginDir, loadRegistry, type PluginManifest } from "@xinit/core";

/** The manifest fields surfaced to an agent when it lists/searches plugins. */
export interface PluginSummary {
  name: string;
  displayName: string;
  appliesTo?: PluginManifest["appliesTo"];
  capabilities: PluginManifest["capabilities"];
  /** Absolute path to the authored plugin folder (used by add_plugin). */
  dir: string;
}

/**
 * Locate the repo `plugins/` directory.
 *
 * Resolution order:
 *   1. `XINIT_PLUGINS_DIR` env override (deployments that relocate the plugins).
 *   2. Walk up from this module looking for a `plugins/` folder that actually
 *      contains at least one `<name>/plugin.json` (the reference registry).
 */
export function resolvePluginsDir(): string {
  const override = process.env.XINIT_PLUGINS_DIR;
  if (override && isPluginsDir(override)) return path.resolve(override);

  let dir = path.dirname(fileURLToPath(import.meta.url));
  // Walk to the filesystem root.
  for (;;) {
    const candidate = path.join(dir, "plugins");
    if (isPluginsDir(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to the override (even if unverified) or a best-effort guess so the
  // caller gets a clear "no plugins found" rather than a crash.
  return override ? path.resolve(override) : path.join(process.cwd(), "plugins");
}

/** True when `dir` holds at least one authored plugin child (`plugin.json`/`plugin.ts`). */
function isPluginsDir(dir: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some(
    (e) => e.isDirectory() && isPluginDir(path.join(dir, e.name)),
  );
}

/** Enumerate the bundled reference plugins as agent-facing summaries. */
export function listBundledPlugins(pluginsDir: string): PluginSummary[] {
  const registry = loadRegistry(pluginsDir);
  const out: PluginSummary[] = [];
  for (const entry of registry.values()) {
    out.push({
      name: entry.manifest.name,
      displayName: entry.manifest.displayName,
      appliesTo: entry.manifest.appliesTo,
      capabilities: entry.manifest.capabilities,
      dir: entry.dir,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Look up a single bundled plugin folder by name, or null if unknown. */
export function findBundledPluginDir(
  pluginsDir: string,
  name: string,
): string | null {
  const entry = loadRegistry(pluginsDir).get(name);
  return entry ? entry.dir : null;
}

/**
 * Heuristic: does this reference look like a filesystem path / URL a user pasted
 * (⇒ third-party trust) rather than a bare bundled plugin name (⇒ first-party)?
 */
export function looksLikePath(ref: string): boolean {
  return (
    ref.startsWith(".") ||
    ref.startsWith("~") ||
    ref.includes("/") ||
    ref.includes("\\") ||
    path.isAbsolute(ref)
  );
}
