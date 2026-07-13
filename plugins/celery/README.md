# celery

Adds **Celery** — a distributed task queue — to a Python app, backed by Redis.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup make plugins/celery/plugin.ts`.

- **Languages:** `python`.
- **Detect:** dependency `celery`.
- **Depends on:** `redis`.

## What it installs / writes

- **Installs:** `celery` and the `redis` client (broker + result back-end
  transport), dispatched through the app's manager (`uv add` on a uv project,
  else `poetry add` / `pip install`).
- **`celery_app.py`** — the Celery app, reading its broker from
  `CELERY_BROKER_URL`:

  ```python
  import os

  from celery import Celery

  BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")

  app = Celery("app", broker=BROKER_URL, backend=BROKER_URL)


  @app.task
  def ping() -> str:
      return "pong"
  ```

- **`.env` / `.env.example`:** seeds
  `CELERY_BROKER_URL=redis://localhost:6379/0` (existing values are never
  overwritten).

## Running it

Start a worker (you'll need a Redis server running):

```
celery -A celery_app worker
```

## Capabilities

`install` only — no exec, no network.
