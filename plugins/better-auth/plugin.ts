import { definePlugin } from "@initup/core";

/**
 * Better Auth — framework-agnostic authentication for TypeScript/JavaScript.
 *
 * Install-only: drops a minimal `betterAuth({...})` config exported as `auth`
 * (the shape Better Auth expects — exported as `auth` or default from an
 * `auth` file), and seeds the two env vars the library reads automatically
 * (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`). Wiring the handler route and
 * choosing a database adapter are framework-specific, so they are surfaced as
 * manual steps rather than guessed.
 */
export default definePlugin({
  name: "better-auth",
  displayName: "Better Auth",
  version: "1.0.0",
  languages: ["ts", "js"],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "better-auth" },
  prompts: [],
  setup: async (ctx) => {
    ctx.install(["better-auth"]);

    const ext = ctx.language() === "ts" ? "ts" : "js";

    // Minimal instance, exported as `auth` (Better Auth resolves the instance
    // by the `auth` export or default export of this file).
    ctx.addFile(
      `src/lib/auth.${ext}`,
      `import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // Configure a database adapter, social providers, plugins, etc. here.
  // Docs: https://www.better-auth.com/docs
  emailAndPassword: {
    enabled: true,
  },
});
`,
    );

    // Better Auth reads these from the environment automatically.
    // setEnv never clobbers an existing value; it also seeds .env.example.
    ctx.setEnv("BETTER_AUTH_SECRET", "dev-secret-change-me", { example: true });
    ctx.setEnv("BETTER_AUTH_URL", "http://localhost:3000", { example: true });

    ctx.warn(
      "Mount the Better Auth handler on a catch-all route for your framework " +
        "(e.g. `toNextJsHandler(auth)` at app/api/auth/[...all], or " +
        "`toNodeHandler(auth)` for Node/Express). See " +
        "https://www.better-auth.com/docs/installation#mount-handler",
    );
    ctx.warn(
      "Generate a real BETTER_AUTH_SECRET before deploying, e.g. " +
        "`openssl rand -base64 32`, and set BETTER_AUTH_URL to your app URL.",
    );
  },
});
