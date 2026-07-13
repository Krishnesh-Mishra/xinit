/**
 * Sandbox shim + typed-plugin helpers (SPEC §7).
 *
 * A typed `plugin.ts` does `import { definePlugin } from "xinit"` (or
 * `@xinit/core`). We never bundle those heavy packages into a plugin artifact:
 * esbuild marks them EXTERNAL, and at eval time a shim `require` resolves exactly
 * those ids to identity factories `{ definePlugin, pluginMake }` and THROWS for
 * anything else — which doubles as the SPEC §7 "no arbitrary requires" guard.
 *
 * The bundled `setup` string may evaluate to EITHER shape:
 *   - a bare default-exported function (old `setup.ts`), or
 *   - a default-exported definition OBJECT (typed form) whose `.setup` is the fn.
 * `resolveSetupFn` collapses both; `definitionObject`/`factsFromDefinition`
 * extract the manifest facts from the typed form.
 */
import type { Capabilities, PluginManifest, SetupFn } from "../types.js";

/**
 * esbuild `external` list for bundling a typed plugin: keep the authoring SDK
 * (and its subpaths) out of the artifact so `import { definePlugin }` becomes a
 * shimmed require rather than an inlined copy of the toolchain.
 */
export const XINIT_EXTERNALS = ["xinit", "@xinit/core", "@xinit/core/*"];

const identity = <T>(value: T): T => value;

/** What the shim exposes for `xinit` / `@xinit/core`: the authoring identities. */
const SDK_SHIM = { definePlugin: identity, pluginMake: identity };

/** True for the authoring SDK ids the shim is allowed to resolve. */
function isSdkId(id: string): boolean {
  return id === "xinit" || id === "@xinit/core" || id.startsWith("@xinit/core/");
}

/**
 * Sandbox `require`: resolves the authoring SDK to identities; throws for every
 * other id. This is the only bridge a bundled plugin gets — no `fs`, no
 * `child_process`, no arbitrary imports (SPEC §7).
 */
export function shimRequire(id: string): unknown {
  if (isSdkId(id)) return SDK_SHIM;
  throw new Error(`require("${id}") is blocked in the plugin sandbox`);
}

/** Evaluate a bundled CJS module string with the shim require; return its exports. */
export function evalModule(source: string): Record<string, unknown> {
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const evaluate = new Function("module", "exports", "require", source);
  evaluate(mod, mod.exports, shimRequire);
  return mod.exports;
}

/** The module's default export, or the exports object itself if there is none. */
function defaultExport(exports: Record<string, unknown>): unknown {
  return exports.default ?? exports;
}

/**
 * Resolve a bundled setup module's exports to the setup function, supporting
 * BOTH the bare-function default and the definition-object (`.setup`) shapes.
 */
export function resolveSetupFn(exports: Record<string, unknown>): SetupFn {
  const def = defaultExport(exports);
  const fn =
    typeof def === "function"
      ? def
      : (def as { setup?: unknown } | null)?.setup;
  if (typeof fn !== "function") {
    throw new Error("plugin setup bundle has no default-exported setup function");
  }
  return fn as SetupFn;
}

/** The typed-form definition object (throws if the default export is not one). */
export function definitionObject(
  exports: Record<string, unknown>,
): Record<string, unknown> {
  const def = defaultExport(exports);
  if (typeof def !== "object" || def === null) {
    throw new Error(
      "typed plugin must default-export a definePlugin(...) object",
    );
  }
  return def as Record<string, unknown>;
}

/** Extract the manifest FACTS from a typed definition object (drops `setup`). */
export function factsFromDefinition(
  def: Record<string, unknown>,
): PluginManifest {
  if (typeof def.name !== "string" || typeof def.displayName !== "string") {
    throw new Error("plugin definition is missing `name`/`displayName`");
  }
  if (typeof def.capabilities !== "object" || def.capabilities === null) {
    throw new Error(`plugin "${def.name}" is missing \`capabilities\``);
  }

  const manifest: PluginManifest = {
    schemaVersion: 1,
    name: def.name,
    displayName: def.displayName,
    capabilities: def.capabilities as Capabilities,
  };
  if (def.version !== undefined) manifest.version = def.version as string;
  if (def.appliesTo !== undefined)
    manifest.appliesTo = def.appliesTo as PluginManifest["appliesTo"];
  if (def.dependsOn !== undefined) manifest.dependsOn = def.dependsOn as string[];
  if (def.conflicts !== undefined) manifest.conflicts = def.conflicts as string[];
  if (def.requires !== undefined)
    manifest.requires = def.requires as Record<string, string>;
  if (def.detect !== undefined)
    manifest.detect = def.detect as PluginManifest["detect"];
  if (def.prompts !== undefined)
    manifest.prompts = def.prompts as PluginManifest["prompts"];
  return manifest;
}
