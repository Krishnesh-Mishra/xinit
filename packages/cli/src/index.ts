/**
 * `xinit` library entry — the typed plugin authoring SDK.
 *
 * Plugin authors write `import { definePlugin } from "xinit"` (or the
 * `pluginMake` alias) in a single typed `plugin.ts`, then compile it with
 * `xinit make`. This module re-exports those factories and the types an author
 * needs from `@xinit/core`. The `xinit` bin (the CLI) is unaffected — it stays
 * wired to `./dist/cli.js` via the package `bin` field.
 *
 * NOTE: when a plugin is packed, `xinit`/`@xinit/core` are marked EXTERNAL and
 * `definePlugin` resolves to a sandbox-shim identity — so importing from here
 * never drags the CLI/toolchain into the distributable artifact.
 */
export { definePlugin, pluginMake } from "@xinit/core";
export type {
  PluginDefinition,
  Answers,
  Capabilities,
  Capability,
  ConfigEdit,
  Ctx,
  DetectRule,
  EnsureLineOpts,
  Prompt,
  PromptType,
  PluginManifest,
  SetupFn,
} from "@xinit/core";
