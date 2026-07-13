import { definePlugin } from "@initup/core";

/**
 * tRPC v11 — end-to-end typesafe APIs.
 *
 * Install-only scaffold: `@trpc/server` + `@trpc/client`, a minimal router
 * (`initTRPC.create()` + a sample `greeting` query, exporting the `AppRouter`
 * type) and a vanilla client wired with `httpBatchLink`. Mounting the router on
 * an HTTP handler is framework-specific, so it is surfaced as a manual step.
 */
export default definePlugin({
  name: "trpc",
  displayName: "tRPC",
  version: "1.0.0",
  languages: ["ts", "js"],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "@trpc/server" },
  prompts: [],
  setup: async (ctx) => {
    ctx.install(["@trpc/server", "@trpc/client"]);

    const ts = ctx.language() === "ts";
    const ext = ts ? "ts" : "js";

    // --- server: initTRPC + a sample query router ---
    ctx.addFile(
      `src/server/router.${ext}`,
      `import { initTRPC } from "@trpc/server";

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({
  greeting: publicProcedure.query(() => "hello tRPC v11!"),
});
${ts ? "\nexport type AppRouter = typeof appRouter;\n" : ""}`,
    );

    // --- client: vanilla createTRPCClient with an httpBatchLink ---
    ctx.addFile(
      `src/lib/trpc.${ext}`,
      ts
        ? `import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/router";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "http://localhost:3000/trpc",
    }),
  ],
});
`
        : `import { createTRPCClient, httpBatchLink } from "@trpc/client";

export const trpc = createTRPCClient({
  links: [
    httpBatchLink({
      url: "http://localhost:3000/trpc",
    }),
  ],
});
`,
    );

    ctx.warn(
      "Mount `appRouter` on an HTTP handler for your framework — e.g. " +
        "`createHTTPServer({ router: appRouter })` (@trpc/server/adapters/standalone), " +
        "a Next.js route with `fetchRequestHandler`, or Express middleware — and make " +
        "sure the client's `url` matches where it's served.",
    );
  },
});
