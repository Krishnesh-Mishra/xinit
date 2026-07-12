/**
 * Position-aware, CRLF-safe line insertion for line-oriented files
 * (.css / .env / .gitignore …). Idempotent: a line already present is a no-op.
 * See SPEC §6.2–6.4.
 */

import type { PatchResult, EnsureLineOpts } from "../types.js";
import { detectEol, splitLines, joinLines } from "./eol.js";

/** Strip any stray trailing CR/LF and trailing whitespace for comparison. */
function normalize(line: string): string {
  return line.replace(/\r?\n$/, "").trimEnd();
}

export function ensureLine(
  content: string,
  line: string,
  opts?: EnsureLineOpts,
): PatchResult {
  const eol = detectEol(content);
  const target = line.replace(/\r?\n$/, "");
  const targetKey = normalize(target);

  const { lines, trailingNewline } = splitLines(content);

  // Already present (EOL-agnostic compare) ⇒ idempotent no-op.
  if (lines.some((l) => normalize(l) === targetKey)) {
    return { changed: false, content };
  }

  let insertAt: number;
  if (opts?.after !== undefined) {
    const afterKey = normalize(opts.after);
    const idx = lines.findIndex((l) => normalize(l) === afterKey);
    insertAt = idx === -1 ? lines.length : idx + 1;
  } else if (opts?.position === "top") {
    insertAt = 0;
  } else {
    insertAt = lines.length;
  }

  lines.splice(insertAt, 0, target);

  const out = joinLines(lines, eol, trailingNewline);
  return { changed: true, content: out };
}
