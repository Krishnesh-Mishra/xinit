# django

Scaffolds a standard **Django** project into a Python app — deterministically and
offline (no `django-admin startproject` exec).

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `xinit make plugins/django/plugin.ts`.

- **Applies to:** `framework: django` (also usable when scaffolding a new app).
- **Languages:** `python`.
- **Detect:** file `manage.py`.

## Prompt

| id | type | default | purpose |
| --- | --- | --- | --- |
| `projectName` | text | `config` | the settings package that holds `settings.py`/`urls.py`/`wsgi.py`/`asgi.py` |

## What it installs / writes

- **Installs:** `django`. Dispatched through the app's detected manager
  (`uv add` on a uv project, else `poetry add` / `pip install`).
- **Env:** seeds `DJANGO_SECRET_KEY` (a dev-only placeholder) into `.env` and
  `.env.example`. `settings.py` reads it from the environment with a dev fallback,
  so production stays env-driven.
- **Files** — the Django 5.2 `startproject` layout, templated with `projectName`:

  ```text
  manage.py
  <projectName>/
      __init__.py
      settings.py      # SECRET_KEY, DEBUG, INSTALLED_APPS, MIDDLEWARE,
                       # ROOT_URLCONF, TEMPLATES, WSGI/ASGI_APPLICATION,
                       # DATABASES (sqlite), password validators, i18n, static
      urls.py          # admin/ route
      asgi.py
      wsgi.py
  ```

  `manage.py` is written via `findOrCreate`, so an existing one is left intact.

## Running it

Left to you (so the plugin stays install-only):

```
python manage.py migrate
python manage.py runserver
```

## Capabilities

`install` only — no exec, no network.
