/**
 * M2: project detection.
 *
 * `detect()` fingerprints a project on disk and returns the frozen `Project`
 * model (SPEC §3). It is defensive by contract: any directory — empty, broken,
 * or exotic — yields a best-effort Project rather than an exception. Low
 * `confidence` is the signal the CLI uses to ask the user to confirm.
 */
import * as path from "node:path";
import type { DetectedApp, Project, ProjectKind } from "../types.js";
import { existsDir, existsFile, hasManifest, readJsonSafe } from "./fs-utils.js";
import { detectManager } from "./manager.js";
import { analyzeApp } from "./app.js";
import {
  isPackagePath,
  parsePnpmWorkspaceGlobs,
  parseWorkspacesField,
  resolveMembers,
  scanMembers,
} from "./workspace.js";

export async function detect(root: string): Promise<Project> {
  const resolvedRoot = path.resolve(root);
  const manager = detectManager(resolvedRoot);

  const rootPkg = readJsonSafe(path.join(resolvedRoot, "package.json"));
  const workspacesField = rootPkg?.workspaces;

  const hasPnpmWs = existsFile(path.join(resolvedRoot, "pnpm-workspace.yaml"));
  const hasTurbo = existsFile(path.join(resolvedRoot, "turbo.json"));
  const hasWorkspacesField = workspacesField !== undefined;
  const hasAppsDir = existsDir(path.join(resolvedRoot, "apps"));
  const hasPackagesDir = existsDir(path.join(resolvedRoot, "packages"));

  const isMonorepo =
    hasPnpmWs ||
    hasWorkspacesField ||
    hasTurbo ||
    (hasAppsDir && hasPackagesDir);
  const kind: ProjectKind = isMonorepo ? "monorepo" : "single";

  const apps: DetectedApp[] = [];
  const packages: DetectedApp[] = [];
  let confidence: number;

  if (kind === "monorepo") {
    const globs = [
      ...parsePnpmWorkspaceGlobs(resolvedRoot),
      ...parseWorkspacesField(workspacesField),
    ];

    let members: string[] = [];
    let fromConfig = false;
    if (globs.length > 0) {
      members = resolveMembers(resolvedRoot, globs);
      fromConfig = members.length > 0;
    }
    if (members.length === 0) {
      // No workspace config, or config resolved to nothing — scan conventionally.
      members = scanMembers(resolvedRoot);
      fromConfig = false;
    }

    for (const rel of members) {
      const app = analyzeApp(resolvedRoot, rel);
      if (isPackagePath(rel)) packages.push(app);
      else apps.push(app);
    }

    if (members.length === 0) {
      confidence = 0.4; // monorepo signal, but no members found
    } else if (fromConfig) {
      confidence = manager.guessed ? 0.8 : 1.0; // clean, config-driven
    } else {
      confidence = 0.5; // guessed via directory scan
    }
  } else {
    apps.push(analyzeApp(resolvedRoot, "."));
    if (hasManifest(resolvedRoot)) {
      confidence = manager.guessed ? 0.7 : 1.0;
    } else {
      confidence = 0.3; // empty / unrecognized directory
    }
  }

  return {
    root: resolvedRoot,
    kind,
    manager: manager.manager,
    confidence,
    apps,
    packages,
  };
}
