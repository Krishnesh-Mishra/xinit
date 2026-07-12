/**
 * Defensive filesystem helpers for detection.
 *
 * Detection runs against arbitrary, possibly-broken project trees, so every
 * read swallows errors and returns a null/empty best-effort value instead of
 * throwing. Callers stay branch-simple; `detect()` never crashes on a weird dir.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";

export function existsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function existsDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Immediate subdirectory names of `p` (empty if `p` is missing/unreadable). */
export function listDirs(p: string): string[] {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export function readTextSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Parse a JSON file, returning the object or null on any read/parse error. */
export function readJsonSafe(p: string): Record<string, unknown> | null {
  const text = readTextSafe(p);
  if (text === null) return null;
  try {
    const val: unknown = JSON.parse(text);
    return val !== null && typeof val === "object"
      ? (val as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Parse a TOML file (e.g. pyproject.toml), null on any read/parse error. */
export function readTomlSafe(p: string): Record<string, unknown> | null {
  const text = readTextSafe(p);
  if (text === null) return null;
  try {
    const val: unknown = parseToml(text);
    return val !== null && typeof val === "object"
      ? (val as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** True if a directory looks like a JS or Python project unit. */
export function hasManifest(dir: string): boolean {
  return (
    existsFile(path.join(dir, "package.json")) ||
    existsFile(path.join(dir, "pyproject.toml")) ||
    existsFile(path.join(dir, "requirements.txt"))
  );
}
