import { definePlugin } from "@initup/core";

/**
 * Vitest — the Vite-native, Jest-compatible test runner for JS/TS.
 *
 * This plugin installs `vitest`, writes a `vitest.config` (via `defineConfig`
 * from `vitest/config`), drops a trivial passing example test, and wires the
 * `test` script to `vitest run` (single-shot, CI-friendly). Config and test
 * files match the app's language (`.ts` when a tsconfig is present, else `.js`).
 * Install-only — apply never runs the tests for you.
 */
export default definePlugin({
  name: "vitest",
  displayName: "Vitest",
  version: "1.0.0",
  languages: ["ts", "js"],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "vitest" },
  prompts: [],
  setup: async (ctx) => {
    ctx.installDev(["vitest"]);

    const ext = ctx.language() === "ts" ? "ts" : "js";

    ctx.addFile(
      `vitest.config.${ext}`,
      `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,ts}"],
  },
});
`,
    );

    ctx.addFile(
      `src/example.test.${ext}`,
      `import { describe, expect, it } from "vitest";

describe("example", () => {
  it("adds numbers", () => {
    expect(1 + 1).toBe(2);
  });
});
`,
    );

    ctx.setScript("test", "vitest run");
  },
});
