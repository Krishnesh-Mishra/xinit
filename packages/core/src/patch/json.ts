/**
 * Comment-safe, format-preserving JSON(C) deep-merge (SPEC §10).
 *
 * Uses jsonc-parser's surgical `modify`/`applyEdits` so comments, key order and
 * untouched formatting survive. Only leaf paths that actually differ are edited,
 * which keeps the operation idempotent (a fully-present merge is a no-op).
 */

import { parse, modify, applyEdits, type FormattingOptions } from "jsonc-parser";
import type { PatchResult } from "../types.js";
import { detectEol } from "./eol.js";
import { deepMerge, deepEqual, isPlainObject } from "./merge.js";

/** Detect the indentation style used by a JSON document. */
function detectIndent(content: string): {
  insertSpaces: boolean;
  tabSize: number;
} {
  const m = content.match(/\n([ \t]+)\S/);
  if (!m) return { insertSpaces: true, tabSize: 2 };
  const ws = m[1]!;
  if (ws[0] === "\t") return { insertSpaces: false, tabSize: 1 };
  return { insertSpaces: true, tabSize: ws.length };
}

/** Collect the minimal set of leaf edits needed to merge `source` into `base`. */
function collectEdits(
  base: unknown,
  source: unknown,
  prefix: (string | number)[],
  out: { path: (string | number)[]; value: unknown }[],
): void {
  if (!isPlainObject(source)) {
    if (!deepEqual(base, source)) out.push({ path: prefix, value: source });
    return;
  }
  const baseObj = isPlainObject(base) ? base : undefined;
  for (const key of Object.keys(source)) {
    collectEdits(baseObj?.[key], source[key], [...prefix, key], out);
  }
}

export function patchJson(
  content: string,
  merge: Record<string, unknown>,
): PatchResult {
  const eol = detectEol(content);
  const isEmpty = content.trim() === "";
  const existing: unknown = isEmpty ? {} : (parse(content) ?? {});
  const merged = deepMerge(existing, merge);

  if (deepEqual(existing, merged)) return { changed: false, content };

  const formattingOptions: FormattingOptions = { ...detectIndent(content), eol };
  const edits: { path: (string | number)[]; value: unknown }[] = [];
  collectEdits(existing, merge, [], edits);

  let out = isEmpty ? "{}" : content;
  for (const { path, value } of edits) {
    out = applyEdits(out, modify(out, path, value, { formattingOptions }));
  }

  return { changed: true, content: out };
}
