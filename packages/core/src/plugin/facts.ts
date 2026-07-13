/**
 * Synchronous manifest-FACTS reader.
 *
 * The registry, resolver and the CLI/MCP listings need a plugin's facts (name,
 * capabilities, dependsOn, prompts, …) without running its `setup`. Two authored
 * shapes are supported:
 *   - `plugin.json` — parsed directly (fast path, no bundling), or
 *   - `plugin.ts`   — a typed `definePlugin(...)`; bundled with esbuild
 *                     (SDK external) and evaluated behind the sandbox shim to
 *                     extract only its facts.
 *
 * Typed extraction is memoized by path+mtime so repeated registry loads within a
 * process bundle each plugin at most once.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";

import type { PluginManifest } from "../types.js";
import {
  XINIT_EXTERNALS,
  definitionObject,
  evalModule,
  factsFromDefinition,
} from "./shim.js";

/** True when `dir` is an authored plugin folder (either shape). */
export function isPluginDir(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "plugin.json")) ||
    fs.existsSync(path.join(dir, "plugin.ts"))
  );
}

const factsCache = new Map<string, { mtimeMs: number; manifest: PluginManifest }>();

/** Bundle a typed `plugin.ts` synchronously (CJS, node, SDK external). */
function bundleTypedSync(entryFile: string): string {
  const result = esbuild.buildSync({
    entryPoints: [entryFile],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    external: XINIT_EXTERNALS,
    logLevel: "silent",
  });
  return result.outputFiles[0]!.text;
}

/**
 * Read a plugin folder's manifest facts synchronously. Returns null if the
 * folder holds neither a `plugin.json` nor a `plugin.ts`.
 */
export function readManifestFacts(dir: string): PluginManifest | null {
  const jsonPath = path.join(dir, "plugin.json");
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as PluginManifest;
  }

  const tsPath = path.join(dir, "plugin.ts");
  if (!fs.existsSync(tsPath)) return null;

  const mtimeMs = fs.statSync(tsPath).mtimeMs;
  const cached = factsCache.get(tsPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.manifest;

  const bundled = bundleTypedSync(tsPath);
  const manifest = factsFromDefinition(definitionObject(evalModule(bundled)));
  factsCache.set(tsPath, { mtimeMs, manifest });
  return manifest;
}
