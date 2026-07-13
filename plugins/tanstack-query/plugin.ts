import { definePlugin } from "@initup/core";

/**
 * TanStack Query (React Query v5) for a React app.
 *
 * Installs the package, drops a single shared `QueryClient` module, and wraps
 * the app root in `<QueryClientProvider client={queryClient}>`.
 *
 * Two writes cooperate on the entry file:
 *   - `ctx.wrap` inserts the provider and imports `QueryClientProvider`.
 *   - `ctx.ensureImport` adds the `queryClient` binding import (a named import
 *     `wrap` does not add for prop values).
 */
export default definePlugin({
  name: "tanstack-query",
  displayName: "TanStack Query",
  version: "1.0.0",
  appliesTo: { framework: "react" },
  languages: ["ts", "js"],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "@tanstack/react-query" },
  prompts: [],
  setup: async (ctx) => {
    ctx.install(["@tanstack/react-query"]);

    // One shared client for the whole app.
    ctx.addFile(
      "src/lib/queryClient.ts",
      `import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});
`,
    );

    // Wrap the app root; `ctx.wrap` adds the QueryClientProvider import itself.
    const entry = ctx.entryFile();
    ctx.wrap(entry, {
      component: "QueryClientProvider",
      from: "@tanstack/react-query",
      props: { client: "{queryClient}" },
    });

    // Bind the `queryClient` referenced in the prop. `wrap` only imports the
    // wrapper component, so add the client's named import idempotently.
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
