/**
 * Plugin packing (SPEC §4): author folder / file → single distributable manifest.
 *
 * `pack()` accepts three entry forms:
 *   - an old folder (`plugin.json` + optional `setup.ts`),
 *   - a folder containing a typed `plugin.ts` (`definePlugin(...)`), or
 *   - a direct `.ts` file (the typed form).
 *
 * In every case the result is a `PluginManifest` with no remaining filesystem
 * dependencies: the FACTS, the bundled `setup` source as a string, and every
 * template under `files/` base64-encoded.
 *
 * The typed form bundles `plugin.ts` with esbuild while marking the authoring
 * SDK (`initup`, `@initup/core`, `@initup/core/*`) EXTERNAL, then evaluates the
 * bundle behind the sandbox shim to read its facts. The stored `setup` string is
 * that same bundle, whose default export is the definition OBJECT (`.setup`).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";
import type { PluginManifest } from "../types.js";
import {
  initup_EXTERNALS,
  definitionObject,
  evalModule,
  factsFromDefinition,
} from "./shim.js";

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

/** Bundle a plugin source file into one self-contained CJS string. */
async function bundle(entryFile: string): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    // The authoring SDK is type-only (old form) or shimmed at eval (typed form);
    // keep it external so esbuild never inlines the whole toolchain.
    external: initup_EXTERNALS,
    logLevel: "silent",
  });
  return result.outputFiles[0]!.text;
}

/**
 * Pack an authored plugin (folder or a direct typed `.ts` file) into a single
 * distributable `PluginManifest`.
 */
export async function pack(entry: string): Promise<PluginManifest> {
  const stat = fs.statSync(entry);

  let baseDir: string;
  let manifest: PluginManifest;

  if (stat.isFile()) {
    // Direct typed `.ts` file.
    baseDir = path.dirname(entry);
    const setup = await bundle(entry);
    manifest = factsFromDefinition(definitionObject(evalModule(setup)));
    manifest.setup = setup;
  } else {
    baseDir = entry;
    const typedPath = path.join(entry, "plugin.ts");
    if (fs.existsSync(typedPath)) {
      // Typed folder form.
      const setup = await bundle(typedPath);
      manifest = factsFromDefinition(definitionObject(evalModule(setup)));
      manifest.setup = setup;
    } else {
      // Old split form: plugin.json (facts) + optional setup.ts (logic).
      manifest = JSON.parse(
        fs.readFileSync(path.join(entry, "plugin.json"), "utf8"),
      ) as PluginManifest;
      const setupPath = path.join(entry, "setup.ts");
      if (fs.existsSync(setupPath)) {
        manifest.setup = await bundle(setupPath);
      }
    }
  }

  // --- inline templates under files/ as base64, keyed "files/<rel>" ---
  const filesDir = path.join(baseDir, "files");
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
