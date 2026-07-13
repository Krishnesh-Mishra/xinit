import { definePlugin } from "@xinit/core";

/**
 * Material UI (MUI v7) for a React app.
 *
 * MUI styles with Emotion, so `@emotion/react` + `@emotion/styled` are required
 * peers. Setup: a `theme.ts` built with `createTheme`, then the app root wrapped
 * in `<ThemeProvider theme={theme}>` with `<CssBaseline />` to normalize styles.
 *
 * Entry-file writes cooperate:
 *   - `ctx.wrap` inserts ThemeProvider + CssBaseline and imports both.
 *   - `ctx.ensureLine` adds the `theme` default-import binding referenced by the
 *     `theme` prop (which `wrap` does not add, and `ensureImport` cannot express).
 */
export default definePlugin({
  name: "mui",
  displayName: "Material UI",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "@mui/material" },
  prompts: [
    {
      id: "icons",
      type: "confirm",
      message: "Install the Material Icons package (@mui/icons-material)?",
      default: true,
    },
  ],
  setup: async (ctx, answers) => {
    ctx.install(["@mui/material", "@emotion/react", "@emotion/styled"]);
    if (answers.icons ?? true) {
      ctx.install(["@mui/icons-material"]);
    }

    // A starter theme. `createTheme()` with no args yields the default theme —
    // a safe, editable seed the app can customize.
    ctx.addFile(
      "src/theme.ts",
      `import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
  },
});

export default theme;
`,
    );

    // Wrap the app root. `ctx.wrap` imports ThemeProvider + CssBaseline itself;
    // nesting is outermost-first, so ThemeProvider wraps CssBaseline wraps App.
    const entry = ctx.entryFile();
    ctx.wrap(entry, [
      {
        component: "ThemeProvider",
        from: "@mui/material/styles",
        props: { theme: "{theme}" },
      },
      { component: "CssBaseline", from: "@mui/material" },
    ]);

    // Bind the `theme` referenced in the ThemeProvider prop (default import).
    ctx.ensureLine(entry, 'import theme from "./theme";', { position: "top" });

    ctx.warn(
      "If your entry file is not the standard bootstrap, verify ThemeProvider " +
        "and CssBaseline were wrapped around your app root.",
    );
  },
});
