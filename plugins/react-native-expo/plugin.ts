import { definePlugin } from "@initup/core";

/**
 * React Native (Expo) base scaffold.
 *
 * Unlike the patch-based plugins, this one delegates scaffolding to Expo's own
 * `create-expo-app` CLI. That is a subprocess (`exec`) that downloads the
 * template and installs dependencies over the `network`, so both capabilities
 * are declared. `--yes` runs it non-interactively (all defaults); the trailing
 * `.` scaffolds into the current directory. Per SPEC §5 the plan entry for an
 * exec op is just the command string — a weaker guarantee than a patch diff.
 */
export default definePlugin({
  name: "react-native-expo",
  displayName: "React Native (Expo)",
  version: "1.0.0",
  appliesTo: { type: "new-app" },
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: false, exec: true, network: true },
  detect: { dependency: "expo" },
  prompts: [],
  setup: async (ctx) => {
    // `.` = scaffold into the current directory; `--yes` = accept all defaults
    // (non-interactive). create-expo-app installs its own dependencies.
    const flags = "--yes";
    ctx.run("npx create-expo-app@latest . " + flags);
  },
});
