# zustand

Adds **Zustand** (v5) state management to a React app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/zustand/plugin.ts`.

- **Applies to:** `framework: react`.
- **No prompts.**

## What it installs / creates

- **Installs:** `zustand`.
- **`src/store.ts`:** a typed starter `useCounterStore` created with `create`
  from `zustand`.

## No provider needed

Zustand has **no context provider** — a store is a hook returned by `create`,
imported directly wherever it is used. This plugin therefore never touches the
app entrypoint; it only installs the package and drops a starter store.

Capabilities: `install` only — no exec, no network.
