/**
 * Monorepo workspace resolution: read package globs from config, expand them to
 * concrete member directories, or fall back to scanning apps/ and packages/.
 *
 * The pnpm-workspace.yaml reader is a purpose-built line parser (no YAML dep) —
 * it only needs the `packages:` list, which has a stable, simple shape.
 */
import * as path from "node:path";
import { existsDir, hasManifest, listDirs, readTextSafe } from "./fs-utils.js";

/** Extract the `packages:` globs from a pnpm-workspace.yaml. */
export function parsePnpmWorkspaceGlobs(root: string): string[] {
  const text = readTextSafe(path.join(root, "pnpm-workspace.yaml"));
  if (text === null) return [];

  const globs: string[] = [];
  let inPackages = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      // Inline flow array: `packages: ["apps/*", "packages/*"]`.
      const inline = line.match(/\[(.*)\]/);
      if (inline?.[1] !== undefined) {
        for (const item of inline[1].split(",")) {
          const g = stripQuotes(item.trim());
          if (g) globs.push(g);
        }
        inPackages = false;
      }
      continue;
    }
    if (!inPackages) continue;

    const item = line.match(/^\s*-\s*(.+)$/);
    if (item?.[1] !== undefined) {
      const g = stripQuotes(item[1].trim());
      if (g) globs.push(g);
      continue;
    }
    // A non-blank, non-comment, non-list line closes the block.
    const trimmed = line.trim();
    if (trimmed !== "" && !trimmed.startsWith("#")) inPackages = false;
  }
  return globs;
}

function stripQuotes(s: string): string {
  return s.replace(/^["']/, "").replace(/["']$/, "").trim();
}

/** Extract globs from a package.json `workspaces` field (array or object form). */
export function parseWorkspacesField(workspaces: unknown): string[] {
  if (Array.isArray(workspaces)) {
    return workspaces.filter((w): w is string => typeof w === "string");
  }
  if (workspaces !== null && typeof workspaces === "object") {
    const pkgs = (workspaces as Record<string, unknown>).packages;
    if (Array.isArray(pkgs)) {
      return pkgs.filter((w): w is string => typeof w === "string");
    }
  }
  return [];
}

/**
 * Expand one glob to relative directory paths (posix-style).
 * Supports a literal path, a trailing `*`/`**`, and a partial-segment prefix
 * (`libs/pkg-*`). Deeper `**` nesting collapses to the immediate level — enough
 * for real-world workspace layouts in v1.
 */
export function resolveGlob(root: string, pattern: string): string[] {
  const norm = pattern.replace(/\\/g, "/").replace(/\/+$/, "");
  if (norm === "" || norm.startsWith("!")) return [];

  const starIdx = norm.indexOf("*");
  if (starIdx === -1) {
    return existsDir(path.join(root, norm)) ? [norm] : [];
  }

  const before = norm.slice(0, starIdx);
  const lastSlash = before.lastIndexOf("/");
  const base = lastSlash === -1 ? "" : before.slice(0, lastSlash);
  const prefix = lastSlash === -1 ? before : before.slice(lastSlash + 1);
  const baseAbs = base ? path.join(root, base) : root;

  return listDirs(baseAbs)
    .filter((d) => d.startsWith(prefix))
    .map((d) => (base ? `${base}/${d}` : d));
}

/** Resolve all globs and keep only directories that contain a manifest. */
export function resolveMembers(root: string, globs: string[]): string[] {
  const set = new Set<string>();
  for (const g of globs) {
    for (const dir of resolveGlob(root, g)) {
      if (hasManifest(path.join(root, dir))) set.add(dir);
    }
  }
  return [...set];
}

/** Fallback: scan apps/* and packages/* for manifest-bearing directories. */
export function scanMembers(root: string): string[] {
  const out: string[] = [];
  for (const base of ["apps", "packages"]) {
    for (const dir of listDirs(path.join(root, base))) {
      const rel = `${base}/${dir}`;
      if (hasManifest(path.join(root, rel))) out.push(rel);
    }
  }
  return out;
}

/** Classify a member path: everything under packages/ is a package. */
export function isPackagePath(rel: string): boolean {
  return rel.replace(/\\/g, "/").startsWith("packages/");
}
