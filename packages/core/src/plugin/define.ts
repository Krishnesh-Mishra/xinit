/**
 * `definePlugin` — the typed plugin authoring API (SPEC §4).
 *
 * An author writes ONE type-safe file instead of `plugin.json` + `setup.ts`:
 * a default-exported `definePlugin({ ...facts, setup })`. `initup make` then packs
 * that file into the same distributable JSON (`manifest facts` + bundled `setup`
 * string + base64 `files`).
 *
 * This module imports ONLY types so it stays dependency-free: at author time it
 * pulls in `@initup/core` for types; at plugin-eval time `definePlugin` resolves
 * to a shimmed identity (see plugin/shim.ts), so importing it never drags the
 * toolchain into the bundled setup.
 */
import type {
  Answers,
  Capabilities,
  Ctx,
  DetectRule,
  Language,
  Prompt,
} from "../types.js";

/**
 * A typed plugin definition: every manifest FACT plus the `setup` function.
 * The FACT fields mirror `PluginManifest` (minus packed-artifact/schema fields,
 * which `pack` fills in).
 */
export interface PluginDefinition {
  /** Unique plugin id (kebab-case), e.g. `"tailwind-v4"`. Referenced by `dependsOn`/`conflicts`. */
  name: string;
  /** Human-readable name shown in the wizard, e.g. `"Tailwind CSS v4"`. */
  displayName: string;
  /** Plugin version (semver). Conventionally `"1.0.0"`. */
  version?: string;
  /**
   * Where this plugin can be applied. `framework` matches a detected app
   * framework (`"react"`, `"next"`, `"express"`, `"expo"`, …); `type` matches an
   * app kind (`"new-app"` for scaffolds, `"node-backend"` for servers).
   * Omitted ⇒ applies anywhere.
   * @example { framework: "react" }
   * @example { type: "node-backend" }
   */
  appliesTo?: { type?: string; framework?: string };
  /**
   * App languages this plugin supports. Omitted ⇒ universal; present ⇒ only
   * compatible when the app's `language` is in this list (SPEC §5).
   * @example ["ts", "js"]
   */
  languages?: Language[];
  /**
   * Other plugins that must be present first; initup offers to add missing ones.
   * @example ["tailwind-v4"]
   */
  dependsOn?: string[];
  /**
   * Plugins that cannot coexist with this one; resolution fails loudly if present.
   * @example ["prisma-sqlite"]
   */
  conflicts?: string[];
  /**
   * Required versions of already-installed deps (semver ranges). Unmet ⇒ error.
   * @example { react: ">=19", tailwindcss: ">=4" }
   */
  requires?: Record<string, string>;
  /**
   * What this plugin is allowed to do. Be honest — `exec`/`network` trip the
   * consent gate (SPEC §8). Set `exec: true` only if `setup` calls `ctx.run`.
   * @example { install: true, exec: false, network: false }
   */
  capabilities: Capabilities;
  /**
   * How to tell the plugin is already installed (UX/listing only — NOT the
   * idempotency guard; each op is independently idempotent).
   * @example { dependency: "@heroui/react" }
   * @example { file: "components.json" }
   */
  detect?: DetectRule;
  /**
   * Questions asked before `setup` runs; answers arrive keyed by `id`.
   * @example [{ id: "icons", type: "confirm", message: "Install icons?", default: true }]
   */
  prompts?: Prompt[];
  /**
   * The plugin's logic. Reads (`ctx.exists`, `ctx.readJson`, resolvers, `ctx.prompt`)
   * run immediately so you can branch; writes (`ctx.install`, `ctx.patchConfig`,
   * `ctx.wrap`, …) are recorded and applied transactionally on commit.
   * `answers` is keyed by prompt `id`.
   * @param ctx  the toolbox — every effect goes through it (never `fs`).
   * @param answers  prompt answers keyed by prompt id.
   */
  setup: (ctx: Ctx, answers: Answers) => void | Promise<void>;
}

/**
 * Typed identity. Returns its argument unchanged; the value is only used for its
 * inferred type (author-time IntelliSense + checking). `setup` conforms to
 * `SetupFn`, so a definition can be consumed anywhere a setup function is.
 *
 * @example A modifier plugin (adds a library to an existing React app):
 * ```ts
 * import { definePlugin } from "initup"; // "@initup/core" also works
 *
 * export default definePlugin({
 *   name: "tailwind-v4",
 *   displayName: "Tailwind CSS v4",
 *   version: "1.0.0",
 *   languages: ["ts", "js"],
 *   appliesTo: { framework: "react" },
 *   capabilities: { install: true, exec: false, network: false },
 *   detect: { dependency: "tailwindcss" },
 *   prompts: [],
 *   setup: async (ctx) => {
 *     ctx.installDev(["tailwindcss", "@tailwindcss/vite"]);
 *     ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", {
 *       ensureImport: { tailwindcss: "@tailwindcss/vite" },
 *       addToArray: { path: "plugins", value: "tailwindcss()" },
 *     });
 *     ctx.ensureLine(ctx.stylesheet({ createIfMissing: true }),
 *       '@import "tailwindcss";', { position: "top" });
 *   },
 * });
 * ```
 * Compile it to a distributable JSON with `initup make plugins/tailwind-v4/plugin.ts`.
 */
export function definePlugin<D extends PluginDefinition>(def: D): D {
  return def;
}

/** Alias — `import { pluginMake } from "initup"` reads well for some authors. */
export const pluginMake = definePlugin;
