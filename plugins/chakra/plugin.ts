import { definePlugin } from "@initup/core";

/**
 * Chakra UI v3 for a React app.
 *
 * v3 is a hard break from v2: the package set shrank to `@chakra-ui/react` +
 * `@emotion/react` (no `@emotion/styled` / `framer-motion` peers), the theme is
 * a "system" object, and the provider is `<ChakraProvider value={defaultSystem}>`
 * — NOT v2's `<ChakraProvider theme={...}>` or `<ChakraProvider>` with no value.
 * Every LLM trained on v2 gets this wrong.
 *
 * Entry-file writes cooperate:
 *   - `ctx.wrap` inserts ChakraProvider and imports it.
 *   - `ctx.ensureImport` adds the `defaultSystem` named-import binding referenced
 *     by the `value` prop (merged into the same `@chakra-ui/react` import).
 */
export default definePlugin({
  name: "chakra",
  displayName: "Chakra UI v3",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "@chakra-ui/react" },
  prompts: [],
  setup: async (ctx) => {
    // v3 packages: Chakra + Emotion react only.
    ctx.install(["@chakra-ui/react", "@emotion/react"]);

    // Wrap the app root. `ctx.wrap` imports ChakraProvider itself; the built-in
    // `defaultSystem` supplies the theming system for the `value` prop.
    const entry = ctx.entryFile();
    ctx.wrap(entry, {
      component: "ChakraProvider",
      from: "@chakra-ui/react",
      props: { value: "{defaultSystem}" },
    });

    // Bind `defaultSystem` referenced in the prop — merged into the same
    // @chakra-ui/react import `wrap` created for ChakraProvider.
    ctx.ensureImport(entry, {
      named: ["defaultSystem"],
      from: "@chakra-ui/react",
    });

    ctx.warn(
      "If your entry file is not the standard bootstrap, verify the " +
        "ChakraProvider was wrapped around your app root.",
    );
  },
});
