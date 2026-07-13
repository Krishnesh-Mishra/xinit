# uv

Scaffolds the **uv** Python package-manager base for a new Python app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/uv/plugin.ts`.

- **Applies to:** `type: new-app`.
- **Languages:** `python`.
- **Detect:** file `uv.lock`.

## Prompt

- **`python`** (text): the Python version, default `3.12`. Used for
  `requires-python` and `.python-version`.

## What it writes

- **`pyproject.toml`** — a minimal PEP 621 `[project]` (name/version/`requires-python`/`dependencies`).
  Created only if absent (`findOrCreate` never clobbers an existing one).
- **`.python-version`** — the chosen version, e.g. `3.12`.
- **`.gitignore`** — a Python-flavoured ignore (`.venv/`, `__pycache__/`, `.env`,
  tool caches, build artifacts).

## Why it shells out to nothing

`uv` may not be installed on the machine, so this plugin never runs `uv init`.
It only writes files deterministically. You create the environment yourself:

```
uv sync
```

## Capabilities

**All false** — it installs nothing and runs nothing; it is a pure file writer
(file writes are always recorded and reversible).
