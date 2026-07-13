# fastapi

Adds a minimal **FastAPI** web API skeleton to a Python app.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/fastapi/plugin.ts`.

- **Applies to:** `framework: fastapi` (also usable when scaffolding a new app).
- **Languages:** `python`.
- **Detect:** dependency `fastapi`.

## What it installs / writes

- **Installs:** `fastapi[standard]` — the recommended extra that bundles Uvicorn
  (the ASGI server) and the `fastapi` CLI, so no separate uvicorn install is
  needed. Dispatched through the app's manager (`uv add` on a uv project, else
  `poetry add` / `pip install`).
- **Entry file** (`main.py`, else `app.py`, resolved via `findOrCreate`): a starter
  app with a `GET /` route:

  ```python
  from fastapi import FastAPI

  app = FastAPI()


  @app.get("/")
  async def root():
      return {"message": "Hello World"}
  ```

## Running it

Starting the server is left to you (so the plugin stays install-only):

```
uvicorn main:app --reload    # or: fastapi dev main.py
```

## Capabilities

`install` only — no exec, no network.
