# ruff

Adds **Ruff** (Python linter + formatter) and configures it in `pyproject.toml`.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/ruff/plugin.ts`.

- **Applies to:** any Python app (no framework restriction).
- **Languages:** `python`.
- **Detect:** dependency `ruff`. (A `ruff.toml` is the other conventional marker,
  but a plugin's `detect` is a single rule; the dev dependency is more reliable.)

## What it installs / patches

- **Dev install:** `ruff` — dispatched through the app's manager
  (`uv add --dev` on a uv project, else `poetry add --group dev` / `pip install`).
- **`pyproject.toml`** — deep-merges (format-preserving, via `ctx.patchToml`):

  ```toml
  [tool.ruff]
  line-length = 100

  [tool.ruff.lint]
  select = ["E", "F", "I"]
  ```

  `E` = pycodestyle errors, `F` = Pyflakes, `I` = isort import sorting.
  Re-running is a byte-identical no-op.

## Capabilities

`install` only — no exec, no network. Run `ruff check` / `ruff format` yourself.
