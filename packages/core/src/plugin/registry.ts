/**
 * Plugin registry: discover authored plugin folders under a directory and map
 * each declared `name` to its folder. Facts only — no bundling here (that is
 * `pack`/`load`). Used by the resolver to satisfy `dependsOn`/`conflicts`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { PluginManifest } from "../types.js";
import { readManifestFacts } from "./facts.js";

export interface RegistryEntry {
  name: string;
  dir: string;
  manifest: PluginManifest;
}

export type Registry = Map<string, RegistryEntry>;

/**
 * Build a name → entry map for every authored plugin folder directly under
 * `pluginsDir`. Both authored shapes are read: `plugin.json` (parsed) and a
 * typed `plugin.ts` (bundled + evaluated for its facts — see facts.ts).
 */
export function loadRegistry(pluginsDir: string): Registry {
  const registry: Registry = new Map();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  } catch {
    return registry;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(pluginsDir, entry.name);
    try {
      const manifest = readManifestFacts(dir);
      if (!manifest) continue;
      registry.set(manifest.name, { name: manifest.name, dir, manifest });
    } catch {
      // Skip malformed/unreadable manifests — fail loud only when one is needed.
    }
  }
  return registry;
}
