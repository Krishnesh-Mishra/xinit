/**
 * Batch Python plugins (round 2) — sqlalchemy, pytest, celery — exercised
 * end-to-end against a real uv-managed Python fixture.
 *
 * Each test packs the actual authored plugin folder (`plugins/<name>`), runs it
 * with `addPlugin` against a temp `pyproject.toml` + empty `uv.lock` + `main.py`
 * fixture, and captures the `InstallSpec` with a mock installer (no network).
 * The key cross-cutting assertion: `ctx.install`/`installDev` dispatches with
 * `manager: "uv"` — proving the manager is detected from the app (`uv.lock`) and
 * the plugin never special-cases it. NOTE: the fixture has NO `package.json`, or
 * a JS manager would win over uv (see detect/manager.ts).
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
const PLUGINS = path.join(REPO_ROOT, "plugins");

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-plugins-py2-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });

  // A uv-managed Python app: pyproject + (empty) uv.lock ⇒ manager "uv".
  // Crucially NO package.json (that would make the detected manager npm).
  await fsp.writeFile(
    path.join(work, "pyproject.toml"),
    '[project]\nname = "svc"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = []\n',
  );
  await fsp.writeFile(path.join(work, "uv.lock"), "");
  await fsp.writeFile(path.join(work, "main.py"), 'print("hi")\n');
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");

/** Run a packed plugin against the fixture, capturing the install spec. */
async function run(name: string, answers?: Record<string, unknown>) {
  const manifest = await pack(path.join(PLUGINS, name));
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

describe("sqlalchemy plugin", () => {
  it("installs sqlalchemy (+alembic dev) via uv and writes db.py + DATABASE_URL", async () => {
    const { manifest, result, spec } = await run("sqlalchemy");

    expect(manifest.name).toBe("sqlalchemy");
    expect(manifest.languages).toEqual(["python"]);
    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });

    expect(result.status).toBe("success");

    // Install through the uv manager; alembic defaults on (prompt default true).
    expect(spec?.manager).toBe("uv");
    expect(spec?.deps).toEqual(["sqlalchemy"]);
    expect(spec?.devDeps).toEqual(["alembic"]);
    expect(result.installed).toContain("sqlalchemy");
    expect(result.installed).toContain("alembic");

    // db.py: engine + SessionLocal + Base from DATABASE_URL.
    const dbPy = read("db.py");
    expect(dbPy).toContain("from sqlalchemy import create_engine");
    expect(dbPy).toContain("engine = create_engine(DATABASE_URL)");
    expect(dbPy).toContain("SessionLocal = sessionmaker(");
    expect(dbPy).toContain("class Base(DeclarativeBase):");
    expect(dbPy).toContain('os.environ.get(\n    "DATABASE_URL"');
    expect(result.created).toContain("db.py");

    // DATABASE_URL seeded into .env + .env.example (psycopg 3 URL).
    expect(read(".env")).toContain(
      "DATABASE_URL=postgresql+psycopg://localhost/app",
    );
    expect(read(".env.example")).toContain(
      "DATABASE_URL=postgresql+psycopg://localhost/app",
    );

    // Alembic migration step surfaced.
    expect(
      result.warnings.some((w) => w.includes("alembic init migrations")),
    ).toBe(true);
  });

  it("skips alembic when the prompt is declined", async () => {
    const { result, spec } = await run("sqlalchemy", { alembic: false });

    expect(result.status).toBe("success");
    expect(spec?.deps).toEqual(["sqlalchemy"]);
    expect(spec?.devDeps).toEqual([]);
    expect(result.installed).not.toContain("alembic");
  });
});

describe("pytest plugin", () => {
  it("dev-installs pytest via uv, configures pyproject, and writes a test", async () => {
    const { manifest, result, spec } = await run("pytest");

    expect(manifest.name).toBe("pytest");
    expect(manifest.languages).toEqual(["python"]);
    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });

    expect(result.status).toBe("success");

    // Dev install through the uv manager.
    expect(spec?.manager).toBe("uv");
    expect(spec?.devDeps).toEqual(["pytest"]);
    expect(result.installed).toContain("pytest");

    // pyproject deep-merged with the pytest ini_options (existing keys kept).
    const pyproject = read("pyproject.toml");
    expect(pyproject).toContain('name = "svc"');
    expect(pyproject).toContain("[tool.pytest.ini_options]");
    expect(pyproject).toMatch(/testpaths = \[\s*"tests",?\s*\]/);

    // A trivial passing test is written under tests/.
    const testFile = read("tests/test_example.py");
    expect(testFile).toContain("def test_example():");
    expect(testFile).toContain("assert 1 + 1 == 2");
    expect(result.created).toContain("tests/test_example.py");
  });
});

describe("celery plugin", () => {
  it("installs celery + redis via uv and writes celery_app.py + broker env", async () => {
    const { manifest, result, spec } = await run("celery");

    expect(manifest.name).toBe("celery");
    expect(manifest.languages).toEqual(["python"]);
    expect(manifest.dependsOn).toEqual(["redis"]);
    expect(manifest.capabilities).toEqual({
      install: true,
      exec: false,
      network: false,
    });

    expect(result.status).toBe("success");

    // Install through the uv manager; both celery and the redis client.
    expect(spec?.manager).toBe("uv");
    expect(spec?.deps).toEqual(["celery", "redis"]);
    expect(result.installed).toContain("celery");
    expect(result.installed).toContain("redis");

    // celery_app.py builds a Celery app with the broker read from the env.
    const celeryApp = read("celery_app.py");
    expect(celeryApp).toContain("from celery import Celery");
    expect(celeryApp).toContain('os.environ.get("CELERY_BROKER_URL"');
    expect(celeryApp).toContain("app = Celery(");
    expect(celeryApp).toContain("broker=BROKER_URL");
    expect(result.created).toContain("celery_app.py");

    // Broker URL seeded into .env + .env.example.
    expect(read(".env")).toContain(
      "CELERY_BROKER_URL=redis://localhost:6379/0",
    );
    expect(read(".env.example")).toContain(
      "CELERY_BROKER_URL=redis://localhost:6379/0",
    );

    // Worker start step surfaced.
    expect(
      result.warnings.some((w) =>
        w.includes("celery -A celery_app worker"),
      ),
    ).toBe(true);
  });
});
