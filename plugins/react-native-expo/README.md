# react-native-expo

Scaffolds a new **React Native** app with **Expo** by delegating to Expo's
official `create-expo-app` CLI.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/react-native-expo/plugin.ts`.

- **Applies to:** `type: new-app` (a base scaffold).
- **Detect:** dependency `expo`.
- **Languages:** `ts`, `js`.
- **No prompts.**

## What it does

Runs, non-interactively, in the current directory:

```
npx create-expo-app@latest . --yes
```

`.` scaffolds into the current directory and `--yes` accepts all defaults so
there are no interactive prompts. `create-expo-app` downloads the template and
installs its own dependencies.

## Capabilities

`exec` + `network` — this plugin runs a subprocess that reaches the network. Per
SPEC §5 an exec op has a **weaker safety guarantee** than a patch op: the plan
shows the command string, not a file diff. Per SPEC §8 a third-party exec plugin
trips the consent handshake before it runs.
