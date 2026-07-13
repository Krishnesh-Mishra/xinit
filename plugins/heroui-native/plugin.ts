import { definePlugin } from "@xinit/core";

/**
 * HeroUI Native for React Native / Expo (built on Uniwind + Tailwind v4).
 *
 * This is the canonical "encode the exact multi-step setup once so it is never
 * done wrong" plugin. The correct install is a precise sequence: the component
 * package, a specific set of pinned peer dependencies, three CSS `@import`s in a
 * LOAD-BEARING order (tailwindcss → uniwind → heroui-native), and two provider
 * wrappers around the app root (outermost GestureHandlerRootView, then
 * HeroUINativeProvider). XInit records all of it deterministically.
 *
 * Capabilities: install only (no exec, no network). Provider wiring that older
 * (v3-style) guides tell you to do by hand is automated by `ctx.wrap`, which
 * falls back to a manual-step warning if it cannot locate the app root.
 */
export default definePlugin({
  name: "heroui-native",
  displayName: "HeroUI Native",
  version: "1.0.0",
  appliesTo: { framework: "expo" },
  languages: ["ts", "js"],
  dependsOn: ["uniwind"],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "heroui-native" },
  prompts: [],
  setup: async (ctx) => {
    // 1. The component library.
    ctx.install(["heroui-native"]);

    // 2. Pinned peer dependencies (exact versions HeroUI Native expects).
    ctx.install([
      "react-native-reanimated@^4.1.1",
      "react-native-gesture-handler@^2.28.0",
      "react-native-worklets@^0.5.1",
      "react-native-safe-area-context@^5.6.0",
      "react-native-svg@^15.12.1",
      "tailwind-variants@^3.2.2",
      "tailwind-merge@^3.4.0",
    ]);

    // 3. Global stylesheet imports — ORDER IS LOAD-BEARING (SPEC §6.4):
    //    tailwindcss first, then uniwind, then heroui-native/styles. Each
    //    `after` pins the next import directly below the previous one.
    const css = ctx.stylesheet({ createIfMissing: true });
    ctx.ensureLine(css, "@import 'tailwindcss';", { position: "top" });
    ctx.ensureLine(css, "@import 'uniwind';", {
      after: "@import 'tailwindcss';",
    });
    ctx.ensureLine(css, "@import 'heroui-native/styles';", {
      after: "@import 'uniwind';",
    });

    // 4. Wrap the app root: GestureHandlerRootView (outermost, flex:1) then
    //    HeroUINativeProvider. The array nests outermost-first. If the codemod
    //    cannot find the app root, ctx.wrap leaves the file untouched and
    //    surfaces a manual-step warning instead (SPEC §5).
    ctx.wrap(ctx.entryFile(), [
      {
        component: "GestureHandlerRootView",
        from: "react-native-gesture-handler",
        props: { style: "{{ flex: 1 }}" },
      },
      { component: "HeroUINativeProvider", from: "heroui-native" },
    ]);
  },
});
