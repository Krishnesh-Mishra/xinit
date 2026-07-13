# Annotated plugin examples

Five real first-party plugins, read line by line. Each shows a different slice of
the `ctx` API in a genuine setting. The source lives under `plugins/<name>/plugin.ts`;
the exact `ctx` signatures are in [ctx-reference.md](./ctx-reference.md).

- [heroui — config patch + load-bearing CSS order](#heroui--config-patch--load-bearing-css-order)
- [shadcn — CLI wrapper + exec/network consent](#shadcn--cli-wrapper--execnetwork-consent)
- [mongodb — install + setEnv + wire via ensureImport](#mongodb--install--setenv--wire-via-ensureimport)
- [tanstack-query — wrap + prop binding via ensureImport](#tanstack-query--wrap--prop-binding-via-ensureimport)
- [django — Python scaffold + patchToml-style facts + setEnv](#django--python-scaffold--setenv)

---

## heroui — config patch + load-bearing CSS order

`plugins/heroui/plugin.ts`. HeroUI v3 is a hard break from v2: styles ship as a
separate `@heroui/styles` package imported **from CSS**, and there is no
`<HeroUIProvider>` anymore. So this plugin never touches the app entry — it
installs, registers the Tailwind Vite plugin, and adds two CSS imports **in a
load-bearing order**.

```ts
export default definePlugin({
  name: "heroui",
  displayName: "HeroUI v3",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  dependsOn: ["tailwind-v4"],
  requires: { react: ">=19", tailwindcss: ">=4" },
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "@heroui/react" },
  prompts: [],
  setup: async (ctx) => {
    ctx.install(["@heroui/styles", "@heroui/react"]);
    ctx.installDev(["@tailwindcss/vite", "tailwindcss"]);

    ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });

    const css = ctx.stylesheet({ createIfMissing: true });
    ctx.ensureLine(css, '@import "tailwindcss";', { position: "top" });
    ctx.ensureLine(css, '@import "@heroui/styles";', {
      after: '@import "tailwindcss";',
    });
  },
});
```

- **`dependsOn: ["tailwind-v4"]` + `requires`** — HeroUI builds on Tailwind's
  layers, so the tailwind plugin is pulled first; `requires` fails loudly if the
  installed React/Tailwind are too old.
- **`ctx.install` / `ctx.installDev`** — runtime vs dev deps, recorded and batched.
- **`ctx.patchConfig(ctx.configFile("vite") ?? …)`** — resolves the *real* Vite
  config (extension varies) instead of hardcoding, then idempotently adds the
  import and pushes `tailwindcss()` into the `plugins` array.
- **`ctx.stylesheet({ createIfMissing: true })`** — finds the global stylesheet, or
  creates + wires one; returns its path.
- **The two `ctx.ensureLine` calls** — order is critical: `{ position: "top" }`
  pins Tailwind first, and `{ after: '@import "tailwindcss";' }` pins HeroUI's
  import directly below it. Position-aware inserts (SPEC §6.4) make this
  deterministic, and both are idempotent no-ops on re-run.

## shadcn — CLI wrapper + exec/network consent

`plugins/shadcn/plugin.ts`. A thin wrapper over the official `shadcn` CLI, which
**runs a subprocess** *and* **downloads component source over the network** — so it
honestly declares `exec` + `network`, which trips the consent gate.

```ts
export default definePlugin({
  name: "shadcn",
  displayName: "shadcn/ui",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  dependsOn: ["tailwind-v4"],
  capabilities: { install: true, exec: true, network: true },
  detect: { file: "components.json" },
  prompts: [
    {
      id: "components",
      type: "multiselect",
      message: "Which components should be added now?",
      choices: ["button", "input", "card", "dialog"],
      default: [],
    },
  ],
  setup: async (ctx, answers) => {
    ctx.patchJson(ctx.configFile("tsconfig") ?? "tsconfig.json", {
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
    });

    ctx.patchConfig(ctx.configFile("vite") ?? "vite.config.ts", {
      ensureImport: { path: "node:path" },
      merge: { resolve: { alias: { "@": "path.resolve(__dirname, './src')" } } },
    });

    ctx.run("npx shadcn@latest init -d");

    const components = Array.isArray(answers.components)
      ? (answers.components as string[])
      : [];
    if (components.length > 0) {
      ctx.run("npx shadcn@latest add " + components.join(" "));
    }
  },
});
```

- **`capabilities: { install: true, exec: true, network: true }`** — honest: the
  CLI both shells out and fetches code. Per SPEC §8 this returns
  `confirmation_required` in AI mode until the agent echoes the `confirmToken`; on
  the CLI it needs `--yes` (or interactive approval).
- **`detect: { file: "components.json" }`** — file-based detection for listings
  (UX only).
- **`ctx.patchJson(...tsconfig...)`** — deep-merges the `@/*` path alias so shadcn's
  generated `@/...` imports resolve.
- **`ctx.patchConfig(...vite..., { ensureImport, merge })`** — adds
  `import path from "node:path"` and deep-merges the matching `resolve.alias`. The
  `merge` value `"path.resolve(__dirname, './src')"` is a raw expression string
  emitted verbatim into the config.
- **`ctx.run("npx shadcn@latest init -d")`** — the exec op; its Plan entry is just
  the command string (weak guarantee).
- **`answers.components`** — a `multiselect` answer, coerced to `string[]`; a second
  conditional `ctx.run` adds the chosen components only if any were selected.

## mongodb — install + setEnv + wire via ensureImport

`plugins/mongodb/plugin.ts`. Adds MongoDB via Mongoose to a Node backend: install,
seed an env var, drop a connection module, and wire it into the Express entry.

```ts
export default definePlugin({
  name: "mongodb",
  displayName: "MongoDB (Mongoose)",
  appliesTo: { type: "node-backend" },
  languages: ["ts", "js"],
  dependsOn: ["express"],
  conflicts: ["prisma-sqlite"],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "mongoose" },
  prompts: [
    { id: "dbName", type: "text", message: "Database name?", default: "app" },
  ],
  setup: async (ctx, answers) => {
    const dbName =
      typeof answers.dbName === "string" && answers.dbName.trim() !== ""
        ? answers.dbName.trim()
        : "app";

    ctx.install(["mongoose"]);

    ctx.setEnv("MONGODB_URI", `mongodb://localhost:27017/${dbName}`, {
      example: true,
    });

    ctx.copy("files/mongo.ts", "src/config/mongo.ts");

    ctx.ensureImport("src/server.ts", {
      named: ["connectDB"],
      from: "./config/mongo",
      call: "connectDB()",
    });
  },
});
```

- **`dependsOn: ["express"]` / `conflicts: ["prisma-sqlite"]`** — pulls the Express
  plugin first (it wires into that server), and refuses to coexist with the
  Prisma-SQLite plugin.
- **Defensive `answers.dbName`** — coerced from `unknown`, trimmed, defaulted to
  `"app"`.
- **`ctx.setEnv("MONGODB_URI", …, { example: true })`** — env-aware upsert: never
  clobbers a developer's existing `MONGODB_URI`, and `example: true` seeds a
  committed `.env.example` alongside `.env`.
- **`ctx.copy("files/mongo.ts", "src/config/mongo.ts")`** — copies the bundled
  template (base64-inlined at pack time) into the app.
- **`ctx.ensureImport("src/server.ts", { named, from, call })`** — the payoff: adds
  `import { connectDB } from "./config/mongo";` *and* ensures the `connectDB();`
  call exists in the entry — idempotently, merged with existing imports.

## tanstack-query — wrap + prop binding via ensureImport

`plugins/tanstack-query/plugin.ts`. Installs React Query, drops one shared
`QueryClient`, and wraps the app root in `<QueryClientProvider client={queryClient}>`.
The instructive bit is how **two writes cooperate** on the entry file.

```ts
export default definePlugin({
  name: "tanstack-query",
  displayName: "TanStack Query",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "@tanstack/react-query" },
  prompts: [],
  setup: async (ctx) => {
    ctx.install(["@tanstack/react-query"]);

    ctx.addFile(
      "src/lib/queryClient.ts",
      `import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000, refetchOnWindowFocus: false },
  },
});
`,
    );

    const entry = ctx.entryFile();
    ctx.wrap(entry, {
      component: "QueryClientProvider",
      from: "@tanstack/react-query",
      props: { client: "{queryClient}" },
    });

    ctx.ensureImport(entry, {
      named: ["queryClient"],
      from: "./lib/queryClient",
    });

    ctx.warn(
      "If your entry file is not the standard bootstrap, verify the " +
        "QueryClientProvider was wrapped around your app root.",
    );
  },
});
```

- **`ctx.addFile(...)`** — writes a computed/templated module (not a static
  template, so `addFile`, not `copy`).
- **`ctx.entryFile()`** — resolves the real bootstrap; the same `entry` path is
  reused by the next two ops.
- **`ctx.wrap(entry, { component, from, props })`** — the format-preserving JSX
  codemod. `props: { client: "{queryClient}" }` uses the braces convention →
  `client={queryClient}`. `wrap` imports the **wrapper component**
  (`QueryClientProvider`) itself, is idempotent, and never corrupts the file (falls
  back to a warning if it can't find a render site).
- **`ctx.ensureImport(entry, { named: ["queryClient"], from: "./lib/queryClient" })`**
  — the crucial companion: `wrap` does **not** import bindings used inside `props`,
  so the `queryClient` referenced in `client={queryClient}` is imported here.
- **`ctx.warn(...)`** — an honest manual-verify note, safe to call unconditionally.

## django — Python scaffold + setEnv

`plugins/django/plugin.ts`. A deterministic, offline `startproject`-style scaffold
for a Python app — install-only, no shelling out, so every capability but `install`
is honestly `false`. It shows the Python resolvers, `findOrCreate`, `addFile`, and
`setEnv` working together with `languages: ["python"]`.

```ts
export default definePlugin({
  name: "django",
  displayName: "Django",
  appliesTo: { framework: "django" },
  languages: ["python"],
  capabilities: { install: true, exec: false, network: false },
  detect: { file: "manage.py" },
  prompts: [
    {
      id: "projectName",
      type: "text",
      message: "Project (settings) package name?",
      default: "config",
    },
  ],
  setup: (ctx, answers) => {
    const raw =
      typeof answers.projectName === "string" && answers.projectName.trim()
        ? answers.projectName.trim()
        : "config";
    const project = /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) ? raw : "config";

    ctx.install(["django"]);

    const DEV_SECRET = "django-insecure-dev-only-change-me";
    ctx.setEnv("DJANGO_SECRET_KEY", DEV_SECRET, { example: true });

    ctx.findOrCreate(["manage.py"], "manage.py", managePy(project));

    ctx.addFile(`${project}/__init__.py`, "");
    ctx.addFile(`${project}/settings.py`, settingsPy(project, DEV_SECRET));
    ctx.addFile(`${project}/urls.py`, urlsPy(project));
    ctx.addFile(`${project}/asgi.py`, asgiPy(project));
    ctx.addFile(`${project}/wsgi.py`, wsgiPy(project));

    ctx.warn("Run 'python manage.py migrate' then 'python manage.py runserver'.");
  },
});
```

- **`languages: ["python"]` + `capabilities: { install: true, exec: false, network: false }`**
  — declares the Python target and stays honest: it never shells out to
  `django-admin`, it just writes files.
- **`ctx.install(["django"])`** — manager-aware: dispatched as `uv add django` /
  `poetry add django` / `pip install django` at apply time, from the detected
  manager, with no change to how you call it.
- **`ctx.setEnv("DJANGO_SECRET_KEY", DEV_SECRET, { example: true })`** — seeds a
  dev-only secret without ever overwriting an existing value; `example: true` writes
  a committed `.env.example` too. `settings.py` reads `DJANGO_SECRET_KEY` from the
  environment with this value as a fallback.
- **`ctx.findOrCreate(["manage.py"], "manage.py", …)`** — writes `manage.py` only if
  absent; an existing one is left intact (idempotent).
- **The five `ctx.addFile` calls** — the settings package files, templated with the
  validated `project` name. Since there is **no Python AST surgery in v1**, Python
  source is generated as templated strings via `addFile`, not codemods.
- **`ctx.warn(...)`** — leaves running the migrations/server to the developer.

> Django doesn't call `ctx.patchToml` (it templates whole files), but for editing
> an existing `pyproject.toml` in a Python plugin you'd use
> `ctx.patchToml("pyproject.toml", { project: { dependencies: ["httpx"] } })` — the
> format-preserving, idempotent TOML deep-merge. See
> [ctx-reference.md](./ctx-reference.md#patchtoml).

---

**See also:** [authoring-plugins.md](./authoring-plugins.md) ·
[ctx-reference.md](./ctx-reference.md) ·
[execution-model.md](./execution-model.md) · [using-plugins.md](./using-plugins.md).
