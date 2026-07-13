# python-dotenv

Adds **python-dotenv** to a Python app and wires `.env` loading into the entry.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/python-dotenv/plugin.ts`.

- **Applies to:** any Python app (no framework restriction).
- **Languages:** `python`.
- **Detect:** dependency `python-dotenv` (checked in `pyproject.toml` / `requirements.txt`).

## What it installs / writes

- **Installs:** `python-dotenv` — dispatched through the app's manager
  (`uv add` on a uv project, else `poetry add` / `pip install`).
- **`.env` + `.env.example`:** seeds `APP_ENV=development` (env-aware upsert —
  never overwrites a value you already set).
- **Entry file** (resolved via `ctx.entryFile()` — `main.py`, `app.py`, …): inserts

  ```python
  from dotenv import load_dotenv
  load_dotenv()
  ```

  at the top, in that order.

## v1 limitation: line-level insertion

v1 has **no Python AST codemod** (SPEC §10). The import and the `load_dotenv()`
call are inserted with line-level `ensureLine` — deterministic, CRLF-safe, and
idempotent (re-running is a no-op), but not context-aware of surrounding code.
If your entry file has an unusual structure, review the two inserted lines.

## Capabilities

`install` only — no exec, no network.
