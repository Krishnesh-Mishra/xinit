import { definePlugin } from "@initup/core";

/**
 * Celery — a distributed task queue for a Python app, backed by Redis.
 *
 * Installs `celery` plus the `redis` client (the broker/back-end transport),
 * dispatched through the app's detected manager (`ctx.install` → `uv add` /
 * `poetry add` / `pip install`). Writes a `celery_app.py` that constructs the
 * Celery app with its broker + result back-end read from `CELERY_BROKER_URL`
 * (seeded into `.env`/`.env.example` with a local Redis default). Starting a
 * worker is an exec step, so it's left to the developer via `ctx.warn` — the
 * plugin stays install-only (no exec, no network).
 */
export default definePlugin({
  name: "celery",
  displayName: "Celery",
  version: "1.0.0",
  languages: ["python"],
  dependsOn: ["redis"],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "celery" },
  prompts: [],
  setup: (ctx) => {
    // celery + the redis transport client (manager-agnostic install).
    ctx.install(["celery", "redis"]);

    ctx.addFile(
      "celery_app.py",
      `"""Celery application configured with a Redis broker from the environment."""

import os

from celery import Celery

BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")

# Use Redis for both the message broker and the result back-end.
app = Celery("app", broker=BROKER_URL, backend=BROKER_URL)


@app.task
def ping() -> str:
    """A trivial task, handy for verifying the worker is wired up."""
    return "pong"
`,
    );

    // setEnv never clobbers an existing value; also seeds .env.example.
    ctx.setEnv("CELERY_BROKER_URL", "redis://localhost:6379/0", {
      example: true,
    });

    ctx.warn("Run 'celery -A celery_app worker' to start a worker.");
  },
});
