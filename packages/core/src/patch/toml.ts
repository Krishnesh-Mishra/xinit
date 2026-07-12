/**
 * Format-preserving-where-feasible TOML deep-merge for Python configs
 * (`pyproject.toml`) — SPEC §10. Idempotent: a fully-present merge returns the
 * original bytes untouched (preserving comments/formatting); an actual change
 * is re-serialized via smol-toml, emitted with the file's own EOL.
 */

import { parse, stringify } from "smol-toml";
import type { PatchResult } from "../types.js";
import { detectEol, setEol } from "./eol.js";
import { deepMerge, deepEqual } from "./merge.js";

export function patchToml(
  content: string,
  merge: Record<string, unknown>,
): PatchResult {
  const eol = detectEol(content);
  const isEmpty = content.trim() === "";
  const existing = isEmpty ? {} : (parse(content) as Record<string, unknown>);
  const merged = deepMerge(existing, merge) as Record<string, unknown>;

  if (deepEqual(existing, merged)) return { changed: false, content };

  const out = setEol(stringify(merged), eol);
  return { changed: true, content: out };
}
