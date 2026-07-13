/**
 * `initup` library entry — the typed plugin authoring SDK.
 *
 * Plugin authors write `import { definePlugin } from "initup"` (or the
 * `pluginMake` alias) in a single typed `plugin.ts`, then compile it with
 * `initup make`. This module re-exports those factories and the types an author
 * needs from `@initup/core`. The `initup` bin (the CLI) is unaffected — it stays
 * wired to `./dist/cli.js` via the package `bin` field.
 *
 * NOTE: when a plugin is packed, `initup`/`@initup/core` are marked EXTERNAL and
 * `definePlugin` resolves to a sandbox-shim identity — so importing from here
 * never drags the CLI/toolchain into the distributable artifact.
 */
export { definePlugin, pluginMake } from "@initup/core";
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
} from "@initup/core";
