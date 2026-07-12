# shadcn

Wires up **shadcn/ui** in a React + Tailwind v4 app by driving the official
`shadcn` CLI.

- **Applies to:** `framework: react`.
- **Depends on:** `tailwind-v4`.

## Prompts

| id           | type        | choices                                | effect                          |
| ------------ | ----------- | -------------------------------------- | ------------------------------- |
| `components` | multiselect | `button`, `input`, `card`, `dialog`    | Components to add after `init`.  |

## What it does

- **`tsconfig.json`:** merges `compilerOptions.baseUrl = "."` and
  `paths["@/*"] = ["./src/*"]`.
- **`vite.config.ts`:** ensures `import path from "node:path"` and merges
  `resolve.alias["@"] = path.resolve(__dirname, './src')`.
- **Runs:** `npx shadcn@latest init -d`, then (if any picked)
  `npx shadcn@latest add <components…>`.

## Capabilities & consent

This plugin declares **`exec` + `network`** because the CLI spawns a subprocess
and downloads component source. Per SPEC §8, exec/network plugins **do not run
immediately** in AI mode — `add_plugin` returns
`{ status: "confirmation_required", plan, confirmToken }` and the agent must
re-call with `confirm: <token>` to proceed. In the CLI wizard the Plan surfaces
the exact command strings (exec ops get only a weak, command-string plan — no
diff — since their effect is opaque).
