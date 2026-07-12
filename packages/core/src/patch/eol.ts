/**
 * Line-ending detection and normalization helpers (SPEC §6.3).
 *
 * The primary dev platform is Windows, so CRLF-safety is a contract-level
 * requirement: compare with normalized endings, but emit with the file's own.
 */

export type Eol = "\r\n" | "\n";

/** Detect the dominant EOL of a file. Any CRLF present ⇒ treat the file as CRLF. */
export function detectEol(content: string): Eol {
  return /\r\n/.test(content) ? "\r\n" : "\n";
}

/** Re-emit `content` using the given EOL, regardless of its current endings. */
export function setEol(content: string, eol: Eol): string {
  const normalized = content.replace(/\r\n/g, "\n");
  return eol === "\n" ? normalized : normalized.replace(/\n/g, "\r\n");
}

/**
 * Split content into logical lines (EOL-agnostic), remembering whether the file
 * ended with a trailing newline so it can be faithfully reconstructed.
 */
export function splitLines(content: string): {
  lines: string[];
  trailingNewline: boolean;
} {
  if (content === "") return { lines: [], trailingNewline: false };
  const trailingNewline = /\r?\n$/.test(content);
  const core = content.replace(/\r?\n$/, "");
  return { lines: core.split(/\r\n|\n/), trailingNewline };
}

/** Reconstruct content from lines using the given EOL and trailing-newline flag. */
export function joinLines(
  lines: string[],
  eol: Eol,
  trailingNewline: boolean,
): string {
  const body = lines.join(eol);
  return trailingNewline ? body + eol : body;
}
