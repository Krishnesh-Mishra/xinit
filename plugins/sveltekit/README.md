# sveltekit

Scaffolds a new **SvelteKit** app by wrapping the official Svelte CLI
[`sv create`](https://github.com/sveltejs/cli) (the current replacement for
`create-svelte`) non-interactively.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/sveltekit/plugin.ts`.

- **Applies to:** `type: new-app`.
- **Languages:** `ts`, `js`.
- **Capabilities:** `exec` + `network` — the CLI runs `npx` and downloads the
  template + add-on definitions. It is invoked with `--no-install`, so it does
  **not** install dependencies (`install` is false); a warning reminds you to
  run install.

## Prompts → flags

| Prompt | Flag |
| --- | --- |
| `ts` | `--types ts` / `--types jsdoc` |
| `template` (`minimal` / `demo` / `library`) | `--template <choice>` |
| `addons` (multiselect) | `--add <names…>` / `--no-add-ons` |

Add-on choices: `eslint`, `prettier`, `vitest`, `playwright`, `tailwindcss`.
Always appended: `--no-install --no-dir-check` (`--no-dir-check` lets it
scaffold into an app dir xinit already created).

Example command (all defaults):

```
npx sv create . --template minimal --types ts --add eslint prettier --no-install --no-dir-check
```

## Safety

The CLI's effect is opaque, so the Plan shows only the **command string** (SPEC
§5). As a third-party plugin it trips the consent gate (SPEC §8) because it uses
`exec` + `network`.
