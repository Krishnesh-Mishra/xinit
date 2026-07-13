import { definePlugin } from "@xinit/core";

/**
 * Ruff — the Python linter + formatter, configured in `pyproject.toml`.
 *
 * Installs Ruff as a dev dependency (`ctx.installDev` → `uv add --dev` /
 * `poetry add --group dev` / `pip install`) and deep-merges a `[tool.ruff]`
 * block into `pyproject.toml` via `ctx.patchToml` (format-preserving, idempotent
 * — a fully-present config is a byte-identical no-op). We set a 100-char line
 * length and enable the pycodestyle errors (`E`), Pyflakes (`F`), and isort
 * import-sorting (`I`) rule families.
 */
export default definePlugin({
  name: "ruff",
  displayName: "Ruff",
  version: "1.0.0",
  languages: ["python"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  // A ruff.toml is the other conventional marker, but DetectRule is a single
  // rule; the dev dependency is the most reliable signal in a uv/poetry project.
  detect: { dependency: "ruff" },
  prompts: [],
  setup: (ctx) => {
    ctx.installDev(["ruff"]);

    ctx.patchToml(ctx.configFile("pyproject") ?? "pyproject.toml", {
      tool: {
        ruff: {
          "line-length": 100,
          lint: { select: ["E", "F", "I"] },
        },
      },
    });
  },
});
