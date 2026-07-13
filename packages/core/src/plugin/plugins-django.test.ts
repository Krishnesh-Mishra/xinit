/**
 * Django plugin — exercised end-to-end against a real uv-managed Python fixture.
 *
 * Packs the authored `plugins/django` folder, runs it with `addPlugin` against a
 * temp `pyproject.toml` + empty `uv.lock` fixture (NO `package.json`, or a JS
 * manager would win over uv), and captures the `InstallSpec` with a mock
 * installer (no network). Asserts the manager dispatch (`uv`), that `django` is
 * installed, and that the standard Django project files are scaffolded with the
 * chosen `projectName` templated in (ROOT_URLCONF etc.).
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addPlugin, pack } from "./index.js";
import type { InstallSpec } from "./apply.js";

// This file lives at packages/core/src/plugin/*.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const DJANGO_DIR = path.join(REPO_ROOT, "plugins", "django");

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-django-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });

  // A uv-managed Python app: pyproject + (empty) uv.lock ⇒ manager "uv".
  // Crucially NO package.json (that would make the detected manager npm).
  await fsp.writeFile(
    path.join(work, "pyproject.toml"),
    '[project]\nname = "svc"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = []\n',
  );
  await fsp.writeFile(path.join(work, "uv.lock"), "");
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");

async function run(answers?: Record<string, unknown>) {
  const manifest = await pack(DJANGO_DIR);
  let spec: InstallSpec | undefined;
  const result = await addPlugin({
    pluginDirOrManifest: manifest,
    appDir: work,
    answers,
    installer: async (_dir, s) => {
      spec = s;
    },
  });
  return { manifest, result, spec };
}

describe("django plugin", () => {
  it("installs django via uv and scaffolds the project with the default name", async () => {
    const { manifest, result, spec } = await run();

    expect(manifest.name).toBe("django");
    expect(manifest.languages).toEqual(["python"]);
    expect(manifest.appliesTo).toEqual({ framework: "django" });
    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });

    expect(result.status).toBe("success");

    // ctx.install dispatched with the app's detected manager → uv.
    expect(spec?.manager).toBe("uv");
    expect(spec?.deps).toContain("django");
    expect(result.installed).toContain("django");

    // manage.py scaffolded.
    expect(fs.existsSync(path.join(work, "manage.py"))).toBe(true);
    expect(read("manage.py")).toContain('"config.settings"');

    // The default settings package (config/) is written with ROOT_URLCONF templated.
    expect(fs.existsSync(path.join(work, "config", "settings.py"))).toBe(true);
    const settings = read("config/settings.py");
    expect(settings).toContain('ROOT_URLCONF = "config.urls"');
    expect(settings).toContain('WSGI_APPLICATION = "config.wsgi.application"');
    expect(settings).toContain("INSTALLED_APPS");
    expect(settings).toContain("django.db.backends.sqlite3");

    // Package files present.
    expect(fs.existsSync(path.join(work, "config", "__init__.py"))).toBe(true);
    expect(read("config/urls.py")).toContain("admin.site.urls");
    expect(read("config/asgi.py")).toContain("get_asgi_application");
    expect(read("config/wsgi.py")).toContain("get_wsgi_application");

    // Secret seeded into env; migrate/runserver warning surfaced.
    expect(read(".env")).toContain("DJANGO_SECRET_KEY=");
    expect(
      result.warnings.some((w) => w.includes("manage.py migrate")),
    ).toBe(true);
  });

  it("templates a custom projectName into every project file", async () => {
    const { result } = await run({ projectName: "mysite" });

    expect(result.status).toBe("success");

    expect(read("manage.py")).toContain('"mysite.settings"');

    const settings = read("mysite/settings.py");
    expect(settings).toContain('ROOT_URLCONF = "mysite.urls"');
    expect(settings).toContain('WSGI_APPLICATION = "mysite.wsgi.application"');

    expect(read("mysite/wsgi.py")).toContain('"mysite.settings"');
    expect(read("mysite/asgi.py")).toContain('"mysite.settings"');
    expect(fs.existsSync(path.join(work, "mysite", "__init__.py"))).toBe(true);

    // The default package name must NOT leak when a custom name is given.
    expect(fs.existsSync(path.join(work, "config"))).toBe(false);
  });
});
