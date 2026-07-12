/**
 * CRLF-safe, position-aware `import` insertion for JS/TS source, plus optional
 * ensuring an initialization `call()` statement exists. String-in → string-out;
 * no AST parse needed (works even on syntactically-incomplete scratch files).
 * Idempotent: a module already imported / a call already present is a no-op.
 */

import type { PatchResult } from "../types.js";
import { detectEol, splitLines, joinLines } from "./eol.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function ensureImport(
  content: string,
  spec: { import: string; call?: string },
): PatchResult {
  const eol = detectEol(content);
  const { lines, trailingNewline } = splitLines(content);

  let changed = false;

  // --- ensure the import statement ---
  const esc = escapeRegExp(spec.import);
  // Matches `import "mod";`, `import x from "mod"`, `import { a } from "mod"`, etc.
  const importPresent = new RegExp(`import[^\\n]*['"]${esc}['"]`);
  if (!importPresent.test(content)) {
    const importLine = `import "${spec.import}";`;
    // Position-aware: place after the last existing import, else at the top.
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*import\b/.test(lines[i]!)) lastImport = i;
    }
    lines.splice(lastImport + 1, 0, importLine);
    changed = true;
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
