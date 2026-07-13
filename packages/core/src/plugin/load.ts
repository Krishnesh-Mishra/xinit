/**
 * Plugin loading. Both a folder and an already-packed manifest reduce to the
 * same internal `LoadedPlugin`: a manifest, the bundled setup() source, and a
 * `file()` resolver that turns a `files/...` reference into its text content
 * (raw from disk for a folder; base64-decoded for a packed manifest).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { PluginManifest } from "../types.js";
import { pack } from "./pack.js";

export interface LoadedPlugin {
  manifest: PluginManifest;
  /** Bundled setup() source (empty string for a pure-install plugin). */
  setupSource: string;
  /** Resolve a `files/...` template reference to its UTF-8 content. */
  file(ref: string): string;
}

/** Load an authored plugin folder (packs it to obtain the bundled setup). */
export async function loadPluginFromDir(dir: string): Promise<LoadedPlugin> {
  const manifest = await pack(dir);
  return {
    manifest,
    setupSource: manifest.setup ?? "",
    file(ref: string): string {
      return fs.readFileSync(path.join(dir, ...ref.split("/")), "utf8");
    },
  };
}

/** Load a packed manifest (single distributable JSON). */
export function loadPluginPacked(manifest: PluginManifest): LoadedPlugin {
  return {
    manifest,
    setupSource: manifest.setup ?? "",
    file(ref: string): string {
      const b64 = manifest.files?.[ref];
      if (b64 === undefined) {
        throw new Error(`plugin "${manifest.name}" has no file "${ref}"`);
      }
      return Buffer.from(b64, "base64").toString("utf8");
    },
  };
}
