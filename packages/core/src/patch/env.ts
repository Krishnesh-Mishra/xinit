/**
 * Env-aware, CRLF-safe upsert for dotenv-style files (`.env`, `.env.example`).
 * String-in → PatchResult out; no filesystem access.
 *
 * The governing rule: **never overwrite an existing non-empty value.** If `KEY`
 * already holds a value the developer set, `upsertEnv` is a no-op — it only fills
 * in a key that is absent or present-but-empty (`KEY=`). This keeps re-runs
 * idempotent AND preserves local secrets/overrides across repeated applies.
 */

import type { PatchResult } from "../types.js";
import { detectEol, splitLines, joinLines } from "./eol.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Quote a value only when dotenv would otherwise mis-parse it (spaces, `#`, quotes). */
function formatValue(value: string): string {
  if (value === "") return "";
  if (/[\s#"']/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function upsertEnv(
  content: string,
  key: string,
  value: string,
): PatchResult {
  const eol = detectEol(content);
  const { lines, trailingNewline } = splitLines(content);
  const keyEsc = escapeRegExp(key);
  // Match `KEY=...` with optional surrounding whitespace (`  KEY = value`).
  const lineRe = new RegExp(`^(\\s*)${keyEsc}\\s*=\\s*(.*)$`);
  const formatted = formatValue(value);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*#/.test(line)) continue; // ignore comments
    const m = line.match(lineRe);
    if (!m) continue;

    const existing = (m[2] ?? "").trim();
    // NEVER overwrite a non-empty value the developer set → idempotent no-op.
    if (existing !== "") return { changed: false, content };

    // Present but empty (`KEY=`) → fill it in, preserving indentation.
    lines[i] = `${m[1] ?? ""}${key}=${formatted}`;
    return {
      changed: true,
      content: joinLines(lines, eol, content === "" ? true : trailingNewline),
    };
  }

  // Absent → append a fresh line (newline-terminated).
  const newLine = `${key}=${formatted}`;
  if (content === "") return { changed: true, content: newLine + eol };
  lines.push(newLine);
  return { changed: true, content: joinLines(lines, eol, true) };
}
