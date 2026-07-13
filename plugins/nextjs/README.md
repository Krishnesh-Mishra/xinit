# nextjs

Scaffolds a new **Next.js** app by wrapping the official
[`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
CLI non-interactively.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/nextjs/plugin.ts`.

- **Applies to:** `type: new-app`.
- **Languages:** `ts`, `js`.
- **Capabilities:** `install` + `exec` + `network` — the CLI runs `npx`,
  downloads packages, and installs them (`--use-pnpm`).

## Prompts → flags

| Prompt | Flag |
| --- | --- |
| `ts` | `--ts` / `--js` |
| `app` (App Router) | `--app` / `--no-app` |
| `srcDir` | `--src-dir` / `--no-src-dir` |
| `tailwind` | `--tailwind` / `--no-tailwind` |
| `eslint` | `--eslint` / `--no-eslint` |

Always appended: `--import-alias "@/*" --use-pnpm --yes`. `--yes` fills any
option we don't set with the CLI's defaults, so nothing prompts.

Example command (all defaults):

```
npx create-next-app@latest . --ts --app --no-src-dir --tailwind --eslint --import-alias "@/*" --use-pnpm --yes
```

## Safety

The CLI's effect is opaque, so the Plan shows only the **command string** (SPEC
§5) — a weaker guarantee than a patch plugin. As a third-party plugin it trips
the consent gate (SPEC §8) because it uses `exec` + `network`.
