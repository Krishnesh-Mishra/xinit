/**
 * `definePlugin` — the typed plugin authoring API (SPEC §4).
 *
 * An author writes ONE type-safe file instead of `plugin.json` + `setup.ts`:
 * a default-exported `definePlugin({ ...facts, setup })`. `xinit make` then packs
 * that file into the same distributable JSON (`manifest facts` + bundled `setup`
 * string + base64 `files`).
 *
 * This module imports ONLY types so it stays dependency-free: at author time it
 * pulls in `@xinit/core` for types; at plugin-eval time `definePlugin` resolves
 * to a shimmed identity (see plugin/shim.ts), so importing it never drags the
 * toolchain into the bundled setup.
 */
import type {
  Answers,
  Capabilities,
  Ctx,
  DetectRule,
  Prompt,
} from "../types.js";

/**
 * A typed plugin definition: every manifest FACT plus the `setup` function.
 * The FACT fields mirror `PluginManifest` (minus packed-artifact/schema fields,
 * which `pack` fills in).
 */
export interface PluginDefinition {
  name: string;
  displayName: string;
  version?: string;
  appliesTo?: { type?: string; framework?: string };
  dependsOn?: string[];
  conflicts?: string[];
  /** semver ranges, e.g. { react: ">=19", tailwindcss: ">=4" }. */
  requires?: Record<string, string>;
  capabilities: Capabilities;
  detect?: DetectRule;
  prompts?: Prompt[];
  /** Deferred-write logic. `answers` is keyed by prompt id (loosely typed). */
  setup: (ctx: Ctx, answers: Answers) => void | Promise<void>;
}

/**
 * Typed identity. Returns its argument unchanged; the value is only used for its
 * inferred type (author-time IntelliSense + checking). `setup` conforms to
 * `SetupFn`, so a definition can be consumed anywhere a setup function is.
 */
export function definePlugin<D extends PluginDefinition>(def: D): D {
  return def;
}

/** Alias — `import { pluginMake } from "xinit"` reads well for some authors. */
export const pluginMake = definePlugin;
