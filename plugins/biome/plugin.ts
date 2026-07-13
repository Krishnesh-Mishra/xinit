import { definePlugin } from "@initup/core";

/**
 * Biome (v2) — one fast toolchain for linting AND formatting JS/TS/JSON.
 *
 * Biome replaces the ESLint + Prettier pair with a single dependency and a
 * single `biome.json`. This plugin installs `@biomejs/biome`, drops the current
 * recommended config (formatter + linter both enabled, import organizing on),
 * and wires `lint` / `format` scripts. It does NOT run Biome for you — apply is
 * install-only, so nothing executes against your source.
 */
export default definePlugin({
  name: "biome",
  displayName: "Biome",
  version: "1.0.0",
  languages: ["ts", "js"],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { file: "biome.json" },
  prompts: [],
  setup: async (ctx) => {
    ctx.installDev(["@biomejs/biome"]);

    // Current (Biome v2) recommended config: formatter + linter both enabled,
    // recommended lint rules, and import organizing via the assist actions.
    ctx.addFile(
      "biome.json",
      `{
  "$schema": "https://biomejs.dev/schemas/2.2.4/schema.json",
  "vcs": {
    "enabled": false,
    "clientKind": "git",
    "useIgnoreFile": false
  },
  "files": {
    "ignoreUnknown": false
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double"
    }
  }
}
`,
    );

    ctx.setScript("lint", "biome check .");
    ctx.setScript("format", "biome format --write .");
  },
});
