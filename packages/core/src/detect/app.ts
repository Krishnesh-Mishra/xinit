/**
 * Per-directory analysis: name, language, framework, and installed-plugin hints
 * for a single app/package. Framework and plugin inference are deliberately
 * shallow heuristics (UX only — see SPEC §6); they never gate safety.
 */
import * as path from "node:path";
import type { DetectedApp, Language } from "../types.js";
import { existsFile, readJsonSafe, readTextSafe, readTomlSafe } from "./fs-utils.js";

export function analyzeApp(root: string, relPath: string): DetectedApp {
  const absDir = relPath === "." ? root : path.join(root, relPath);
  const pkg = readJsonSafe(path.join(absDir, "package.json"));
  const py = readTomlSafe(path.join(absDir, "pyproject.toml"));
  const jsDeps = collectJsDeps(pkg);
  const pyDeps = collectPyDeps(py, absDir);
  const hasPy =
    py !== null || existsFile(path.join(absDir, "requirements.txt"));

  const app: DetectedApp = {
    name: pickName(pkg, py, root, relPath),
    path: relPath,
    language: detectLanguage(pkg, jsDeps, absDir, hasPy),
    plugins: inferPlugins(jsDeps, absDir),
  };
  const framework = inferFramework(jsDeps, pyDeps);
  if (framework) app.framework = framework;
  return app;
}

function pickName(
  pkg: Record<string, unknown> | null,
  py: Record<string, unknown> | null,
  root: string,
  relPath: string,
): string {
  const jsName = pkg?.name;
  if (typeof jsName === "string" && jsName.trim() !== "") return jsName;

  const pyName = pyProjectName(py);
  if (pyName) return pyName;

  return relPath === "." ? path.basename(path.resolve(root)) : path.basename(relPath);
}

/** Read the package name from `[project]` or `[tool.poetry]` of a pyproject. */
function pyProjectName(py: Record<string, unknown> | null): string | undefined {
  if (!py) return undefined;
  const project = py.project;
  if (project !== null && typeof project === "object") {
    const n = (project as Record<string, unknown>).name;
    if (typeof n === "string" && n.trim() !== "") return n;
  }
  const tool = py.tool;
  if (tool !== null && typeof tool === "object") {
    const poetry = (tool as Record<string, unknown>).poetry;
    if (poetry !== null && typeof poetry === "object") {
      const n = (poetry as Record<string, unknown>).name;
      if (typeof n === "string" && n.trim() !== "") return n;
    }
  }
  return undefined;
}

function detectLanguage(
  pkg: Record<string, unknown> | null,
  jsDeps: Set<string>,
  absDir: string,
  hasPy: boolean,
): Language {
  if (pkg) {
    const ts =
      jsDeps.has("typescript") || existsFile(path.join(absDir, "tsconfig.json"));
    return ts ? "ts" : "js";
  }
  if (hasPy) return "python";
  return "js";
}

function inferFramework(
  js: Set<string>,
  py: Set<string>,
): string | undefined {
  if (js.has("next")) return "next";
  if (js.has("react") && js.has("vite")) return "react";
  if (js.has("react")) return "react";
  if (js.has("express")) return "express";
  if (py.has("fastapi")) return "fastapi";
  if (py.has("django")) return "django";
  return undefined;
}

/** Recognized already-installed integrations (best-effort, non-exhaustive). */
function inferPlugins(js: Set<string>, absDir: string): string[] {
  const out: string[] = [];
  if (js.has("tailwindcss")) out.push("tailwind");
  if (js.has("@heroui/react")) out.push("heroui");
  if (existsFile(path.join(absDir, "components.json"))) out.push("shadcn");
  if (js.has("mongoose")) out.push("mongodb");
  return out;
}

/** Union of dependency names across all dependency buckets in package.json. */
function collectJsDeps(pkg: Record<string, unknown> | null): Set<string> {
  const set = new Set<string>();
  if (!pkg) return set;
  for (const key of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const bucket = pkg[key];
    if (bucket !== null && typeof bucket === "object") {
      for (const name of Object.keys(bucket)) set.add(name);
    }
  }
  return set;
}

/** Lowercased Python distribution names from pyproject.toml + requirements.txt. */
function collectPyDeps(
  py: Record<string, unknown> | null,
  absDir: string,
): Set<string> {
  const set = new Set<string>();

  if (py) {
    const project = py.project;
    if (project !== null && typeof project === "object") {
      const proj = project as Record<string, unknown>;
      addPySpecs(set, proj.dependencies);
      const optional = proj["optional-dependencies"];
      if (optional !== null && typeof optional === "object") {
        for (const group of Object.values(optional as Record<string, unknown>)) {
          addPySpecs(set, group);
        }
      }
    }
    const tool = py.tool;
    if (tool !== null && typeof tool === "object") {
      const poetry = (tool as Record<string, unknown>).poetry;
      if (poetry !== null && typeof poetry === "object") {
        const deps = (poetry as Record<string, unknown>).dependencies;
        if (deps !== null && typeof deps === "object") {
          for (const name of Object.keys(deps as Record<string, unknown>)) {
            set.add(name.toLowerCase());
          }
        }
      }
    }
  }

  const req = readTextSafe(path.join(absDir, "requirements.txt"));
  if (req) {
    for (const line of req.split(/\r?\n/)) addPyName(set, line);
  }
  return set;
}

function addPySpecs(set: Set<string>, specs: unknown): void {
  if (Array.isArray(specs)) {
    for (const s of specs) if (typeof s === "string") addPyName(set, s);
  }
}

function addPyName(set: Set<string>, spec: string): void {
  const s = spec.trim();
  if (s === "" || s.startsWith("#") || s.startsWith("-")) return;
  const m = s.match(/^[A-Za-z0-9._-]+/);
  if (m) set.add(m[0].toLowerCase());
}
