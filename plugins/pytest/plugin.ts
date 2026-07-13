import { definePlugin } from "@initup/core";

/**
 * pytest — the Python testing framework, configured in `pyproject.toml`.
 *
 * Installs pytest as a dev dependency (`ctx.installDev` → `uv add --dev` /
 * `poetry add --group dev` / `pip install`) and deep-merges a
 * `[tool.pytest.ini_options]` block into `pyproject.toml` via `ctx.patchToml`
 * (format-preserving, idempotent — a fully-present config is a byte-identical
 * no-op) that points `testpaths` at a `tests/` directory. A trivial passing test
 * is written to `tests/test_example.py` so `pytest` is green on the first run.
 *
 * install-only — no exec, no network.
 */
export default definePlugin({
  name: "pytest",
  displayName: "pytest",
  version: "1.0.0",
  languages: ["python"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "pytest" },
  prompts: [],
  setup: (ctx) => {
    ctx.installDev(["pytest"]);

    ctx.patchToml(ctx.configFile("pyproject") ?? "pyproject.toml", {
      tool: {
        pytest: {
          ini_options: {
            testpaths: ["tests"],
          },
        },
      },
    });

    ctx.addFile(
      "tests/test_example.py",
      `def test_example():
    assert 1 + 1 == 2
`,
    );
  },
});
