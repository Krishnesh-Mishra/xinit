import { definePlugin } from "@initup/core";

/**
 * uv — the Python package-manager base for a new Python app (SPEC §10).
 *
 * Deliberately deterministic and offline: `uv` may not even be installed on the
 * machine, so this plugin never shells out (`uv init`). It only *writes files*:
 * a minimal PEP 621 `pyproject.toml`, a `.python-version` pin, and a Python
 * `.gitignore`. The developer runs `uv sync` themselves to materialize the
 * environment (surfaced as a `ctx.warn` manual step).
 *
 * Because it installs nothing and runs nothing, every capability is honestly
 * `false` — it is a pure file writer (file writes are always recorded/reversible
 * and need no capability flag).
 */
export default definePlugin({
  name: "uv",
  displayName: "uv (Python package manager)",
  version: "1.0.0",
  appliesTo: { type: "new-app" },
  languages: ["python"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: false, exec: false, network: false },
  detect: { file: "uv.lock" },
  prompts: [
    {
      id: "python",
      type: "text",
      message: "Which Python version? (used for requires-python and .python-version)",
      default: "3.12",
    },
  ],
  setup: (ctx, answers) => {
    const version =
      typeof answers.python === "string" && answers.python.trim()
        ? answers.python.trim()
        : "3.12";

    // Minimal PEP 621 pyproject — only used when none exists yet. `findOrCreate`
    // leaves an existing pyproject.toml untouched (idempotent).
    ctx.findOrCreate(
      ["pyproject.toml"],
      "pyproject.toml",
      `[project]
name = "app"
version = "0.1.0"
requires-python = ">=${version}"
dependencies = []
`,
    );

    // Pin the interpreter uv should provision.
    ctx.addFile(".python-version", `${version}\n`);

    // A conventional Python .gitignore (venv, caches, bytecode, local env).
    ctx.addFile(
      ".gitignore",
      `# Byte-compiled / optimized
__pycache__/
*.py[cod]
*$py.class

# Distribution / packaging
build/
dist/
*.egg-info/
.eggs/

# Virtual environments
.venv/
venv/
env/

# Environment variables
.env

# Tool caches
.mypy_cache/
.ruff_cache/
.pytest_cache/
`,
    );

    ctx.warn("Run 'uv sync' to create the environment.");
  },
});
