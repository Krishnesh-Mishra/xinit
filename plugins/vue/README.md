# vue

Scaffolds a new **Vue (Vite)** app by wrapping the official
[`create-vue`](https://github.com/vuejs/create-vue) CLI
(`npm create vue@latest`) non-interactively.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/vue/plugin.ts`.

- **Applies to:** `type: new-app`.
- **Languages:** `ts`, `js`.
- **Capabilities:** `exec` + `network` — the CLI runs `npm create`/`npx` and
  downloads the generator. It does **not** install dependencies (`install` is
  false); a warning reminds you to run install.

## Prompts → flags

`create-vue` feature flags are opt-in booleans (there is no `--no-*` form), so
only enabled features add a flag:

| Prompt | Flag (when enabled) |
| --- | --- |
| `ts` | `--ts` |
| `router` | `--router` |
| `pinia` | `--pinia` |
| `vitest` | `--vitest` |
| `eslint` | `--eslint` |
| `prettier` | `--prettier` |

If no feature is selected, `--default` is passed so the CLI stays
non-interactive. `.` scaffolds into the app dir and `--force` allows a non-empty
target; npm needs `--` to forward flags through.

Example command (all defaults — TypeScript only):

```
npm create vue@latest . -- --ts --force
```

## Safety

The CLI's effect is opaque, so the Plan shows only the **command string** (SPEC
§5). As a third-party plugin it trips the consent gate (SPEC §8) because it uses
`exec` + `network`.
