/**
 * CRLF-safe, position-aware `import` insertion for JS/TS source, plus optional
 * ensuring an initialization `call()` statement exists. String-in → string-out;
 * no AST parse needed (works even on syntactically-incomplete scratch files).
 * Idempotent: a module already imported / a call already present is a no-op.
 *
 * Supports three import shapes (combinable):
 *   { import: "x" }                 → `import "x";`                 (side-effect)
 *   { named: ["a","b"], from: "m" } → `import { a, b } from "m";`   (merges into
 *                                       an existing import from `m` if present)
 *   { default: "X", from: "m" }     → `import X from "m";`
 *   default + named together        → `import X, { a } from "m";`
 */

import type { EnsureImportSpec, PatchResult } from "../types.js";
import { detectEol, splitLines, joinLines } from "./eol.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split an import clause into its default, namespace, and named specifiers. */
function parseClause(clause: string): {
  default?: string;
  namespace?: string;
  named: string[];
} {
  const named: string[] = [];
  let namespace: string | undefined;
  let def: string | undefined;

  const brace = clause.match(/\{([^}]*)\}/);
  let rest = clause;
  if (brace) {
    for (const part of brace[1]!.split(",")) {
      const t = part.trim();
      if (t) named.push(t);
    }
    rest = clause.replace(brace[0], "");
  }
  for (const part of rest.split(",")) {
    const t = part.trim();
    if (!t) continue;
    if (t.startsWith("* as ")) namespace = t;
    else def = t;
  }
  return { default: def, namespace, named };
}

/** Rebuild an import clause from its parts (default, namespace, named). */
function buildClause(
  def: string | undefined,
  namespace: string | undefined,
  named: string[],
): string {
  const parts: string[] = [];
  if (def) parts.push(def);
  if (namespace) parts.push(namespace);
  if (named.length > 0) parts.push(`{ ${named.join(", ")} }`);
  return parts.join(", ");
}

/**
 * Ensure a default/named binding import from module `from` exists, merging into
 * an existing single-line import from that module when present. Mutates `lines`.
 */
function ensureBinding(
  lines: string[],
  from: string,
  def: string | undefined,
  named: string[],
): boolean {
  const esc = escapeRegExp(from);
  const importRe = new RegExp(
    `^(\\s*)import\\s+(.+?)\\s+from\\s+['"]${esc}['"]\\s*;?\\s*$`,
  );

  const idx = lines.findIndex((l) => importRe.test(l));

  if (idx === -1) {
    // No import from this module yet → add a fresh line after the last import.
    const clause = buildClause(def, undefined, named);
    const newLine = `import ${clause} from "${from}";`;
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*import\b/.test(lines[i]!)) lastImport = i;
    }
    lines.splice(lastImport + 1, 0, newLine);
    return true;
  }

  // Merge requested specifiers into the existing import from this module.
  const m = lines[idx]!.match(importRe)!;
  const indent = m[1] ?? "";
  const parsed = parseClause(m[2]!.trim());

  let changed = false;
  let curDefault = parsed.default;
  if (def && !curDefault) {
    curDefault = def;
    changed = true;
  }
  const curNamed = [...parsed.named];
  const seen = new Set(curNamed);
  for (const n of named) {
    if (!seen.has(n)) {
      curNamed.push(n);
      seen.add(n);
      changed = true;
    }
  }
  if (!changed) return false;

  const rebuilt = buildClause(curDefault, parsed.namespace, curNamed);
  lines[idx] = `${indent}import ${rebuilt} from "${from}";`;
  return true;
}

export function ensureImport(
  content: string,
  spec: EnsureImportSpec,
): PatchResult {
  const eol = detectEol(content);
  const { lines, trailingNewline } = splitLines(content);

  let changed = false;

  // --- side-effect import: `import "<module>";` (unchanged behavior) ---
  if (spec.import !== undefined) {
    const esc = escapeRegExp(spec.import);
    // Matches `import "mod";`, `import x from "mod"`, `import { a } from "mod"`, …
    const importPresent = new RegExp(`import[^\\n]*['"]${esc}['"]`);
    if (!importPresent.test(content)) {
      const importLine = `import "${spec.import}";`;
      let lastImport = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*import\b/.test(lines[i]!)) lastImport = i;
      }
      lines.splice(lastImport + 1, 0, importLine);
      changed = true;
    }
  }

  // --- named / default binding import from a module ---
  if (spec.from !== undefined && ((spec.named?.length ?? 0) > 0 || spec.default)) {
    if (ensureBinding(lines, spec.from, spec.default, spec.named ?? [])) {
      changed = true;
    }
  }

  // --- optionally ensure the call statement ---
  if (spec.call !== undefined) {
    const call = spec.call.replace(/;\s*$/, "");
    const callEsc = escapeRegExp(call);
    const callPresent = new RegExp(`${callEsc}\\s*;?`);
    if (!callPresent.test(content)) {
      lines.push(`${call};`);
      changed = true;
    }
  }

  if (!changed) return { changed: false, content };
  return {
    changed: true,
    content: joinLines(lines, eol, content === "" ? true : trailingNewline),
  };
}
