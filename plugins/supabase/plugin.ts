import { definePlugin } from "@initup/core";

/**
 * Supabase — installs `@supabase/supabase-js` and drops a shared client built
 * from the project URL + anon (publishable) key. Install-only: the real
 * credentials come from the Supabase dashboard, so the seeded values are
 * placeholders and a manual step points the user at their project settings.
 */
export default definePlugin({
  name: "supabase",
  displayName: "Supabase",
  version: "1.0.0",
  languages: ["ts", "js"],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "@supabase/supabase-js" },
  prompts: [],
  setup: async (ctx) => {
    ctx.install(["@supabase/supabase-js"]);

    const ts = ctx.language() === "ts";
    const ext = ts ? "ts" : "js";
    const bang = ts ? "!" : "";

    ctx.addFile(
      `src/lib/supabase.${ext}`,
      `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL${bang};
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY${bang};

// A single shared Supabase client for the app.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
`,
    );

    ctx.setEnv("SUPABASE_URL", "https://your-project.supabase.co", {
      example: true,
    });
    ctx.setEnv("SUPABASE_ANON_KEY", "your-anon-key", { example: true });

    ctx.warn(
      "Set SUPABASE_URL and SUPABASE_ANON_KEY from your project's API settings " +
        "(Supabase dashboard → Project Settings → API). Never commit real keys.",
    );
  },
});
