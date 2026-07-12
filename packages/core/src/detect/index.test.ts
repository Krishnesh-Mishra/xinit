import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detect } from "./index.js";

/** Files map: relative posix path -> string content. Dirs created as needed. */
type Tree = Record<string, string>;

let root: string;

function mk(tree: Tree): string {
  for (const [rel, content] of Object.entries(tree)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

const json = (o: unknown): string => JSON.stringify(o, null, 2);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "xinit-detect-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("single-app detection", () => {
  it("detects a Vite + React + TS app with tailwind and shadcn", async () => {
    mk({
      "package.json": json({
        name: "my-app",
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: { vite: "^6.0.0", typescript: "^5.7.0", tailwindcss: "^4.0.0" },
      }),
      "tsconfig.json": json({}),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "components.json": json({ style: "default" }),
    });

    const p = await detect(root);
    expect(p.kind).toBe("single");
    expect(p.manager).toBe("pnpm");
    expect(p.confidence).toBe(1);
    expect(p.packages).toEqual([]);
    expect(p.apps).toHaveLength(1);

    const app = p.apps[0]!;
    expect(app.name).toBe("my-app");
    expect(app.path).toBe(".");
    expect(app.language).toBe("ts");
    expect(app.framework).toBe("react");
    expect(app.plugins).toEqual(expect.arrayContaining(["tailwind", "shadcn"]));
  });

  it("detects a plain JS app (no lockfile) with lower confidence", async () => {
    mk({
      "package.json": json({ name: "plain", dependencies: { express: "^4.0.0" } }),
    });

    const p = await detect(root);
    expect(p.kind).toBe("single");
    expect(p.manager).toBe("npm");
    expect(p.confidence).toBe(0.7);
    expect(p.apps[0]!.language).toBe("js");
    expect(p.apps[0]!.framework).toBe("express");
  });

  it("prefers next over react when both present", async () => {
    mk({
      "package.json": json({
        name: "web",
        dependencies: { next: "^15.0.0", react: "^19.0.0" },
        devDependencies: { typescript: "^5.0.0" },
      }),
      "package-lock.json": json({ lockfileVersion: 3 }),
    });

    const p = await detect(root);
    expect(p.manager).toBe("npm");
    expect(p.apps[0]!.framework).toBe("next");
    expect(p.apps[0]!.language).toBe("ts");
  });
});

describe("python detection", () => {
  it("detects a uv + FastAPI project", async () => {
    mk({
      "pyproject.toml":
        '[project]\nname = "svc"\ndependencies = ["fastapi>=0.110", "uvicorn"]\n',
      "uv.lock": "version = 1\n",
    });

    const p = await detect(root);
    expect(p.kind).toBe("single");
    expect(p.manager).toBe("uv");
    expect(p.confidence).toBe(1);

    const app = p.apps[0]!;
    expect(app.name).toBe("svc");
    expect(app.language).toBe("python");
    expect(app.framework).toBe("fastapi");
  });

  it("detects poetry + django via [tool.poetry.dependencies]", async () => {
    mk({
      "pyproject.toml":
        '[tool.poetry]\nname = "site"\n\n[tool.poetry.dependencies]\npython = "^3.12"\nDjango = "^5.0"\n',
      "poetry.lock": "# lock\n",
    });

    const p = await detect(root);
    expect(p.manager).toBe("poetry");
    expect(p.apps[0]!.language).toBe("python");
    expect(p.apps[0]!.framework).toBe("django");
  });

  it("uses pip when only requirements.txt is present", async () => {
    mk({ "requirements.txt": "fastapi==0.111\nuvicorn\n# comment\n" });

    const p = await detect(root);
    expect(p.manager).toBe("pip");
    expect(p.confidence).toBe(1);
    expect(p.apps[0]!.framework).toBe("fastapi");
  });
});

describe("monorepo detection", () => {
  it("detects a clean pnpm + turbo monorepo with globs", async () => {
    mk({
      "package.json": json({ name: "repo", private: true }),
      "pnpm-workspace.yaml": 'packages:\n  - "apps/*"\n  - "packages/*"\n',
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "turbo.json": json({ tasks: {} }),
      "apps/web/package.json": json({
        name: "web",
        dependencies: { next: "^15.0.0", react: "^19.0.0" },
        devDependencies: { typescript: "^5.0.0" },
      }),
      "packages/ui/package.json": json({
        name: "@repo/ui",
        dependencies: { react: "^19.0.0" },
        devDependencies: { typescript: "^5.0.0" },
      }),
    });

    const p = await detect(root);
    expect(p.kind).toBe("monorepo");
    expect(p.manager).toBe("pnpm+turbo");
    expect(p.confidence).toBe(1);

    expect(p.apps).toHaveLength(1);
    expect(p.apps[0]!.name).toBe("web");
    expect(p.apps[0]!.path).toBe("apps/web");
    expect(p.apps[0]!.framework).toBe("next");

    expect(p.packages).toHaveLength(1);
    expect(p.packages[0]!.name).toBe("@repo/ui");
    expect(p.packages[0]!.path).toBe("packages/ui");
    expect(p.packages[0]!.framework).toBe("react");
  });

  it("resolves npm workspaces field (array form)", async () => {
    mk({
      "package.json": json({
        name: "repo",
        workspaces: ["apps/*", "packages/*"],
      }),
      "package-lock.json": json({ lockfileVersion: 3 }),
      "apps/api/package.json": json({
        name: "api",
        dependencies: { express: "^4.0.0" },
      }),
      "packages/lib/package.json": json({ name: "lib" }),
    });

    const p = await detect(root);
    expect(p.kind).toBe("monorepo");
    expect(p.manager).toBe("npm");
    expect(p.confidence).toBe(1);
    expect(p.apps.map((a) => a.path)).toEqual(["apps/api"]);
    expect(p.apps[0]!.framework).toBe("express");
    expect(p.packages.map((a) => a.path)).toEqual(["packages/lib"]);
  });

  it("falls back to directory scan with lower confidence", async () => {
    mk({
      "apps/web/package.json": json({ name: "web", dependencies: { react: "^19.0.0" } }),
      "packages/ui/package.json": json({ name: "ui" }),
    });

    const p = await detect(root);
    expect(p.kind).toBe("monorepo");
    expect(p.confidence).toBe(0.5);
    expect(p.apps.map((a) => a.path)).toEqual(["apps/web"]);
    expect(p.packages.map((a) => a.path)).toEqual(["packages/ui"]);
  });

  it("detects a mixed JS/Python monorepo, preferring the JS manager", async () => {
    mk({
      "package.json": json({ name: "repo", workspaces: ["apps/*"] }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "apps/web/package.json": json({
        name: "web",
        dependencies: { next: "^15.0.0" },
      }),
      "apps/svc/pyproject.toml":
        '[project]\nname = "svc"\ndependencies = ["fastapi"]\n',
    });

    const p = await detect(root);
    expect(p.manager).toBe("pnpm");
    const svc = p.apps.find((a) => a.path === "apps/svc")!;
    expect(svc.language).toBe("python");
    expect(svc.framework).toBe("fastapi");
  });
});

describe("defensive edges", () => {
  it("never throws on an empty directory", async () => {
    const p = await detect(root);
    expect(p.kind).toBe("single");
    expect(p.manager).toBe("unknown");
    expect(p.confidence).toBe(0.3);
    expect(p.apps).toHaveLength(1);
    expect(p.apps[0]!.path).toBe(".");
    expect(p.apps[0]!.language).toBe("js");
    expect(p.apps[0]!.framework).toBeUndefined();
    expect(p.apps[0]!.plugins).toEqual([]);
  });

  it("tolerates malformed package.json", async () => {
    mk({ "package.json": "{ this is not json", "pnpm-lock.yaml": "" });
    const p = await detect(root);
    expect(p.kind).toBe("single");
    expect(p.manager).toBe("pnpm");
    // dir name is used when the manifest is unreadable
    expect(p.apps[0]!.name).toBe(path.basename(root));
  });

  it("returns root as absolute path", async () => {
    mk({ "package.json": json({ name: "x" }) });
    const p = await detect(".");
    expect(path.isAbsolute(p.root)).toBe(true);
  });
});
