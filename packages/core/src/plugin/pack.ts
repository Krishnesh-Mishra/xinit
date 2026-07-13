/**
 * Plugin packing (SPEC §4): author folder → single distributable manifest.
 *
 * `pack()` reads `plugin.json`, bundles `setup.ts` into one self-contained CJS
 * string with esbuild (local imports inlined, the type-only `@xinit/core`
 * marked external), and base64-encodes every template under `files/`. The
 * result is a `PluginManifest` that fully describes the plugin with no
 * remaining filesystem dependencies.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";
import type { PluginManifest } from "../types.js";

/** Recursively list files under `dir`, returning paths relative to `dir`. */
function walk(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walk(path.join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

export async function pack(dir: string): Promise<PluginManifest> {
  const manifestPath = path.join(dir, "plugin.json");
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as PluginManifest;

  // --- bundle setup.ts (optional: pure-install plugins have none) ---
  const setupPath = path.join(dir, "setup.ts");
  if (fs.existsSync(setupPath)) {
    const result = await esbuild.build({
      entryPoints: [setupPath],
      bundle: true,
      format: "cjs",
      platform: "node",
      write: false,
      // @xinit/core is type-only in setup.ts; keep it external so esbuild does
      // not try to resolve/inline the whole core package.
      external: ["@xinit/core"],
      logLevel: "silent",
    });
    manifest.setup = result.outputFiles[0]!.text;
  }

  // --- inline templates under files/ as base64, keyed "files/<rel>" ---
  const filesDir = path.join(dir, "files");
  if (fs.existsSync(filesDir)) {
    const files: Record<string, string> = {};
    for (const rel of walk(filesDir)) {
      const abs = path.join(filesDir, ...rel.split("/"));
      files[`files/${rel}`] = fs.readFileSync(abs).toString("base64");
    }
    if (Object.keys(files).length > 0) manifest.files = files;
  }

  return manifest;
}
