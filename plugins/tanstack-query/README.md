# tanstack-query

Adds **TanStack Query** (React Query v5) to a React app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/tanstack-query/plugin.ts`.

- **Applies to:** `framework: react`.
- **No prompts.**

## What it installs / patches

- **Installs:** `@tanstack/react-query`.
- **`src/lib/queryClient.ts`:** a single shared `QueryClient` instance.
- **Entry file (resolved via `ctx.entryFile()`):** wraps the app root in
  `<QueryClientProvider client={queryClient}>` and adds both the
  `QueryClientProvider` import (via `ctx.wrap`) and the `queryClient` binding
  import (via `ctx.ensureLine`).

If the entrypoint cannot be auto-wrapped, a manual-step warning is surfaced
instead — the file is never corrupted.

Capabilities: `install` only — no exec, no network.
