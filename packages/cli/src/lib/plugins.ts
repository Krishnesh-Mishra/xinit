import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { isPluginDir, readManifestFacts } from "@xinit/core";
import type { Language, PluginManifest, Trust } from "@xinit/core";

/** A `plugins/` dir is valid if any immediate subdir is an authored plugin. */
function hasPlugins(dir: string): boolean {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .some((e) => e.isDirectory() && isPluginDir(path.join(dir, e.name)));
  } catch {
    return false;
  }
}

/**
 * Locate the bundled reference plugins directory by walking up from this module
 * until an ancestor contains a valid `plugins/` folder. This is robust to the
 * differing depths of the built bundle (`packages/cli/dist/cli.js`) and the
 * source under test (`packages/cli/src/lib/*`), which flatten differently.
 * `--plugins-dir` / `XINIT_PLUGINS_DIR` override this.
 */
export function defaultPluginsDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "plugins");
    if (hasPlugins(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: repo-root guess for a built dist layout (packages/cli/dist).
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", "plugins");
}

export function resolvePluginsDir(override?: string): string {
  if (override) return path.resolve(override);
  const env = process.env.XINIT_PLUGINS_DIR;
  if (env) return path.resolve(env);
  return defaultPluginsDir();
}

/**
 * Read a plugin's manifest facts from its folder without running setup —
 * supports both the `plugin.json` and typed `plugin.ts` authored shapes.
 */
export function readManifest(dir: string): PluginManifest {
  const manifest = readManifestFacts(dir);
  if (!manifest) {
    throw new Error(`no plugin.json or plugin.ts found in ${dir}`);
  }
  return manifest;
}

export interface ResolvedPlugin {
  /** Absolute path to the plugin folder. */
  dir: string;
  manifest: PluginManifest;
  /** Bundled plugins are first-party; an arbitrary path the user points at is not. */
  trust: Trust;
}

function looksLikePluginDir(p: string): boolean {
  return isPluginDir(p);
}

/**
 * Resolve the `<plugin>` argument of `xinit add`:
 * - an existing path to a plugin folder → third-party (unless it lives under the
 *   bundled plugins dir), or
 * - a bare name resolved against the bundled plugins dir → first-party.
 */
export function resolvePluginArg(arg: string, pluginsDir: string): ResolvedPlugin {
  // 1. Explicit path to a plugin folder.
  const asPath = path.resolve(arg);
  if (looksLikePluginDir(asPath)) {
    const bundled = path.resolve(pluginsDir);
    const isBundled = asPath === bundled || asPath.startsWith(bundled + path.sep);
    return {
      dir: asPath,
      manifest: readManifest(asPath),
      trust: isBundled ? "first-party" : "third-party",
    };
  }

  // 2. Bare name under the bundled plugins dir.
  const named = path.join(pluginsDir, arg);
  if (looksLikePluginDir(named)) {
    return { dir: named, manifest: readManifest(named), trust: "first-party" };
  }

  throw new Error(
    `Plugin "${arg}" not found. Pass a path to a plugin folder, or a name under ${pluginsDir}.`,
  );
}

/**
 * List every plugin available in the bundled registry (name + manifest).
 * Used by `manage` to offer compatible plugins for an app.
 */
export function listPlugins(pluginsDir: string): ResolvedPlugin[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ResolvedPlugin[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(pluginsDir, e.name);
    if (!looksLikePluginDir(dir)) continue;
    try {
      out.push({ dir, manifest: readManifest(dir), trust: "first-party" });
    } catch {
      // Skip an unreadable manifest rather than failing the whole listing.
    }
  }
  return out;
}

/**
 * Does a plugin match an app? Combines `appliesTo` (framework/type) with the
 * `languages` compatibility list. A plugin with no `appliesTo` is universally
 * applicable framework-wise; a plugin with no `languages` is unrestricted by
 * language. A `languages` list excludes any app whose language is not in it.
 */
export function pluginAppliesToApp(
  manifest: PluginManifest,
  app: { framework?: string; type?: string; language?: Language },
): boolean {
  // Language compatibility (SPEC §5): present ⇒ app language must be in the list.
  if (
    manifest.languages &&
    app.language &&
    !manifest.languages.includes(app.language)
  ) {
    return false;
  }

  const at = manifest.appliesTo;
  if (!at) return true;
  if (at.framework && at.framework !== app.framework) return false;
  if (at.type && app.type && at.type !== app.type) return false;
  // `appliesTo.type` describes app *kind* (e.g. "new-app", "node-backend"); we
  // only have a framework from detection, so a type constraint we can't verify
  // is treated permissively rather than hidden.
  return true;
}
