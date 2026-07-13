# pytest

Adds **pytest** — the Python testing framework — to a Python app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/pytest/plugin.ts`.

- **Languages:** `python`.
- **Detect:** dependency `pytest`.

## What it installs / writes

- **Installs (dev):** `pytest`, dispatched through the app's manager
  (`uv add --dev` on a uv project, else `poetry add --group dev` / `pip install`).
- **`pyproject.toml`:** deep-merges a `[tool.pytest.ini_options]` block (existing
  keys preserved) that discovers tests under `tests/`:

  ```toml
  [tool.pytest.ini_options]
  testpaths = ["tests"]
  ```

- **`tests/test_example.py`** — a trivial passing test so `pytest` is green out of
  the box:

  ```python
  def test_example():
      assert 1 + 1 == 2
  ```

## Running it

```
pytest
```

## Capabilities

`install` only — no exec, no network.
