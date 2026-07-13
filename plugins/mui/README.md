# mui

Adds **Material UI** (MUI v7) to a React app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/mui/plugin.ts`.

- **Applies to:** `framework: react`.

## Prompts

| id      | type    | default | effect                                            |
| ------- | ------- | ------- | ------------------------------------------------- |
| `icons` | confirm | `true`  | Also install `@mui/icons-material` when accepted. |

## What it installs / patches

- **Installs:** `@mui/material`, `@emotion/react`, `@emotion/styled`
  (Emotion is MUI's required styling engine). Optionally `@mui/icons-material`.
- **`src/theme.ts`:** a starter theme built with `createTheme`.
- **Entry file (resolved via `ctx.entryFile()`):** wraps the app root in
  `<ThemeProvider theme={theme}>` around `<CssBaseline />`. `ctx.wrap` adds the
  `ThemeProvider` and `CssBaseline` imports; `ctx.ensureLine` adds the `theme`
  default-import binding.

If the entrypoint cannot be auto-wrapped, a manual-step warning is surfaced
instead — the file is never corrupted.

Capabilities: `install` only — no exec, no network.
