/**
 * Dependency & conflict resolver (SPEC §9, v1: simple, fail-loud).
 *
 * Resolves `dependsOn` recursively into a topological (dependencies-first)
 * order, detects cycles, rejects declared `conflicts` that are present in the
 * app, and checks `requires` semver ranges against the app's installed deps.
 * No version negotiation — any unmet constraint throws with a clear message.
 * All transitive prompts are collected (deduped by id) for a single consent.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { satisfies, coerce } from "semver";

import type { Prompt } from "../types.js";
import type { Registry, RegistryEntry } from "./registry.js";

export interface ResolveResult {
  /** Plugins in dependencies-first order (the requested plugin last). */
  plugins: RegistryEntry[];
  /** Merged prompts across all resolved plugins, deduped by id. */
  prompts: Prompt[];
}

/** Merge dependencies + devDependencies from an app's package.json. */
export function readAppDeps(appDir: string): Record<string, string> {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(appDir, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

export function resolvePlugins(
  name: string,
  registry: Registry,
  appDir: string,
): ResolveResult {
  const appDeps = readAppDeps(appDir);

  const ordered: RegistryEntry[] = [];
  const done = new Set<string>();
  const onStack = new Set<string>();

  const visit = (pluginName: string, chain: string[]): void => {
    if (done.has(pluginName)) return;
    if (onStack.has(pluginName)) {
      throw new Error(
        `plugin dependency cycle: ${[...chain, pluginName].join(" → ")}`,
      );
    }
    const entry = registry.get(pluginName);
    if (!entry) {
      throw new Error(
        `plugin "${pluginName}" not found in registry` +
          (chain.length ? ` (required by ${chain[chain.length - 1]})` : ""),
      );
    }

    onStack.add(pluginName);
    for (const dep of entry.manifest.dependsOn ?? []) {
      visit(dep, [...chain, pluginName]);
    }
    onStack.delete(pluginName);

    done.add(pluginName);
    ordered.push(entry);
  };

  visit(name, []);

  const resolvedNames = new Set(ordered.map((e) => e.name));

  for (const entry of ordered) {
    // --- conflicts: present in the app (installed dep or resolved sibling) ---
    for (const conflict of entry.manifest.conflicts ?? []) {
      const conflictEntry = registry.get(conflict);
      const present =
        resolvedNames.has(conflict) ||
        (conflictEntry !== undefined && isDetected(conflictEntry, appDir, appDeps));
      if (present) {
        throw new Error(
          `plugin "${entry.name}" conflicts with "${conflict}", which is already present`,
        );
      }
    }

    // --- requires: semver ranges against installed deps ---
    for (const [dep, range] of Object.entries(entry.manifest.requires ?? {})) {
      const installed = appDeps[dep];
      if (installed === undefined) {
        throw new Error(
          `plugin "${entry.name}" requires ${dep} ${range}, but ${dep} is not installed`,
        );
      }
      const version = coerce(installed)?.version ?? installed;
      if (!satisfies(version, range, { includePrerelease: true })) {
        throw new Error(
          `plugin "${entry.name}" requires ${dep} ${range}, but ${dep}@${installed} is installed`,
        );
      }
    }
  }

  // --- merged prompt list, deduped by id, dependencies first ---
  const prompts: Prompt[] = [];
  const seen = new Set<string>();
  for (const entry of ordered) {
    for (const prompt of entry.manifest.prompts ?? []) {
      if (seen.has(prompt.id)) continue;
      seen.add(prompt.id);
      prompts.push(prompt);
    }
  }

  return { plugins: ordered, prompts };
}

/** UX-level presence check (SPEC §6: detect is UX only) used for conflicts. */
function isDetected(
  entry: RegistryEntry,
  appDir: string,
  appDeps: Record<string, string>,
): boolean {
  const rule = entry.manifest.detect;
  if (!rule) return false;
  if ("dependency" in rule) return appDeps[rule.dependency] !== undefined;
  if ("file" in rule) return fs.existsSync(path.join(appDir, rule.file));
  return false;
}
