import { definePlugin } from "@initup/core";

/**
 * Uniwind — the fastest Tailwind CSS bindings for React Native (Tailwind v4).
 *
 * This is the base that `heroui-native` depends on. Setup is: install uniwind +
 * tailwindcss, create/wire a global stylesheet with the two required imports
 * (`tailwindcss` then `uniwind`), and configure Metro to run Uniwind's CSS
 * pipeline. The Metro step wraps `getDefaultConfig` in `withUniwindConfig`,
 * which is a function-call wrapper we can only safely author when no
 * `metro.config.js` exists yet; otherwise we surface a manual-step warning
 * rather than risk clobbering an existing config. The Babel worklets plugin is
 * likewise surfaced as a warning (it composes with the user's existing presets).
 *
 * Capabilities: install only (config is done via recorded file writes / warns).
 */
export default definePlugin({
  name: "uniwind",
  displayName: "Uniwind (Tailwind CSS for React Native)",
  version: "1.0.0",
  appliesTo: { framework: "expo" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "uniwind" },
  prompts: [],
  setup: async (ctx) => {
    // 1. Runtime binding + the Tailwind v4 engine it compiles against.
    ctx.install(["uniwind"]);
    ctx.installDev(["tailwindcss"]);

    // 2. Global stylesheet: `@import 'tailwindcss';` then `@import 'uniwind';`
    //    (order matters — Tailwind's layers must be declared first).
    const css = ctx.stylesheet({ createIfMissing: true });
    ctx.ensureLine(css, "@import 'tailwindcss';", { position: "top" });
    ctx.ensureLine(css, "@import 'uniwind';", {
      after: "@import 'tailwindcss';",
    });

    // 3. Metro must run Uniwind's CSS pipeline via `withUniwindConfig`, with the
    //    stylesheet above as the cssEntryFile. `withUniwindConfig` MUST be the
    //    outermost wrapper. We can only safely write this when there is no Metro
    //    config yet; if one exists, wrapping it is a codemod we don't perform.
    const metro = ctx.configFile("metro");
    if (metro) {
      ctx.warn(
        `Wrap your Metro config (${metro}) with withUniwindConfig from 'uniwind/metro' ` +
          `as the OUTERMOST wrapper, e.g. module.exports = withUniwindConfig(config, ` +
          `{ cssEntryFile: './${css}' }); — it must be the outermost wrapper.`,
      );
    } else {
      ctx.addFile(
        "metro.config.js",
        `const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// withUniwindConfig MUST be the outermost wrapper.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './${css}',
});
`,
      );
    }

    // 4. Babel: Uniwind's animations rely on the worklets plugin. This composes
    //    with whatever presets/plugins already exist, so it is a manual step.
    ctx.warn(
      "Add 'react-native-worklets/plugin' to the plugins array in your Babel " +
        "config (babel.config.js), keeping existing presets untouched.",
    );
  },
});
