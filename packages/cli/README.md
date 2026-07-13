# initup

**The deterministic hands your AI agent uses to touch your project.**

Your coding agent is brilliant at deciding *what* to do and unreliable at *doing
it the same way twice*. Ask it to "add HeroUI" and it searches docs, guesses, and
maybe pastes HeroUI **v2**'s `HeroUIProvider` that **v3 deleted** — and if step 4
fails, you're left with a half-migrated project to untangle by hand.

`initup` is the tool the agent calls instead. Adding a technology is **one
deterministic operation** — install the deps **and** patch every config **and**
generate the code — and if *anything* fails, it **rolls the whole thing back** to
exactly where you started.

```
agent: "add mongodb to the api"
  → initup add_plugin("mongodb")
      install mongoose · write .env · src/config/mongo.ts · wire server.ts
      ✗ npm install failed
      ↩ rolled back — every file restored, nothing left behind
```

**That rollback is the whole point.** It's what makes it safe to let an
autonomous agent modify your codebase: the worst case is a clean no-op, never a
broken tree. Same input → same result, every time.

## Install

```bash
npm i -g initup      # or: npx initup <command>
```

## Use it

```bash
initup detect [--json]          # fingerprint the project
initup add heroui [--app web]   # install + patch + generate, transactionally
initup manage                   # interactive: app → plugin
initup doctor [--json]          # report project health
initup pack ./plugins/heroui    # author folder → single distributable JSON
initup make plugins/x/plugin.ts # compile a typed plugin.ts → single JSON
```

`--json` keeps stdout pure JSON (for scripts/agents), `--silent` skips prompts,
`--yes` auto-approves the consent gate. A third-party plugin needing exec/network
shows a dry-run **plan** and asks before touching disk.

## Write a plugin

```ts
import { definePlugin } from "initup";

export default definePlugin({
  name: "tailwind-v4",
  displayName: "Tailwind CSS v4",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "tailwindcss" },
  prompts: [],
  setup: async (ctx) => {
    ctx.installDev(["tailwindcss", "@tailwindcss/vite"]);
    ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });
    ctx.ensureLine(ctx.stylesheet({ createIfMissing: true }),
      '@import "tailwindcss";', { position: "top" });
  },
});
```

Compile it: `initup make plugins/tailwind-v4/plugin.ts` → a single distributable JSON.

## Docs

Full guides, the complete `ctx` API reference, the execution model, and 30+
first-party plugins (JS/TS **and** Python) live in the repo:

**https://github.com/Krishnesh-Mishra/initup**

MIT © Krishnesh Mishra
