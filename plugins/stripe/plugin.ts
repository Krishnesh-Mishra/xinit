import { definePlugin } from "@initup/core";

/**
 * Stripe — installs the `stripe` Node SDK and drops a shared server-side client
 * built from `STRIPE_SECRET_KEY`. Install-only: the secret + webhook signing
 * secret come from the Stripe dashboard, so the seeded values are placeholders.
 */
export default definePlugin({
  name: "stripe",
  displayName: "Stripe",
  version: "1.0.0",
  languages: ["ts", "js"],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "stripe" },
  prompts: [],
  setup: async (ctx) => {
    ctx.install(["stripe"]);

    const ts = ctx.language() === "ts";
    const ext = ts ? "ts" : "js";
    const bang = ts ? "!" : "";

    // Server-side only — the secret key must never reach the browser.
    ctx.addFile(
      `src/lib/stripe.${ext}`,
      `import Stripe from "stripe";

// Uses the account's default API version. Pin one with
// \`new Stripe(key, { apiVersion: "YYYY-MM-DD" })\` if you need stability.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY${bang});
`,
    );

    ctx.setEnv("STRIPE_SECRET_KEY", "sk_test_...", { example: true });
    ctx.setEnv("STRIPE_WEBHOOK_SECRET", "whsec_...", { example: true });

    ctx.warn(
      "Set STRIPE_SECRET_KEY from your Stripe dashboard (Developers → API keys). " +
        "STRIPE_WEBHOOK_SECRET is shown when you create a webhook endpoint or run " +
        "`stripe listen`. Keep both server-side only.",
    );
  },
});
