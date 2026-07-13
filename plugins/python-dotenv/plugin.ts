import { definePlugin } from "@initup/core";

/**
 * python-dotenv — load a `.env` file into the environment at startup.
 *
 * Universal to any Python app (no `appliesTo`). It installs the package
 * (`ctx.install` → `uv add`/`poetry add`/`pip install`, per the app's detected
 * manager), seeds a `.env` + `.env.example` with a starter `APP_ENV`, and wires
 * loading into the resolved entry file with two line-level inserts.
 *
 * v1 uses **line-level insertion** (`ctx.ensureLine`), not a Python AST codemod
 * (SPEC §10 — no `.py` source surgery). The import is pinned to the top and the
 * `load_dotenv()` call is pinned immediately after it, so the order is
 * deterministic and idempotent (re-running is a no-op).
 */
export default definePlugin({
  name: "python-dotenv",
  displayName: "python-dotenv",
  version: "1.0.0",
  languages: ["python"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "python-dotenv" },
  prompts: [],
  setup: (ctx) => {
    ctx.install(["python-dotenv"]);

    // Seed both the local .env and the committed .env.example (never clobbers a
    // value the developer already set).
    ctx.setEnv("APP_ENV", "development", { example: true });

    // Wire loading into the entry. `entryFile()` is Python-aware (main.py,
    // app.py, …). Import first, then the call right below it.
    const entry = ctx.entryFile();
    ctx.ensureLine(entry, "from dotenv import load_dotenv", { position: "top" });
    ctx.ensureLine(entry, "load_dotenv()", {
      after: "from dotenv import load_dotenv",
    });
  },
});
