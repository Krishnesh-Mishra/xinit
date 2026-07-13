# chakra

Adds **Chakra UI v3** to a React app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/chakra/plugin.ts`.

- **Applies to:** `framework: react`.
- **No prompts.**

## What it installs / patches

- **Installs:** `@chakra-ui/react`, `@emotion/react`.
- **Entry file (resolved via `ctx.entryFile()`):** wraps the app root in
  `<ChakraProvider value={defaultSystem}>`. `ctx.wrap` adds the `ChakraProvider`
  import; `ctx.ensureLine` adds the `defaultSystem` binding import.

If the entrypoint cannot be auto-wrapped, a manual-step warning is surfaced
instead — the file is never corrupted.

## Why v3 wiring differs from v2

- v3's package set is **`@chakra-ui/react` + `@emotion/react`** only — no
  `@emotion/styled` or `framer-motion` peers.
- v3's provider is **`<ChakraProvider value={defaultSystem}>`**, not v2's
  `<ChakraProvider theme={...}>`. The `value` is a theming *system*, and the
  built-in `defaultSystem` is the ready-to-use default.

Capabilities: `install` only — no exec, no network.
