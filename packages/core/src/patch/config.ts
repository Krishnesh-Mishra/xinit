/**
 * JS/TS config surgery via magicast/recast (SPEC §5, §10): ensure imports,
 * push into an array, and deep-merge into the default-export object — all
 * format-preserving and idempotent (a fully-applied edit regenerates identical
 * source). Position-aware: imports land near other imports, never blind-append.
 */

import { parseModule, builders, generateCode } from "magicast";
import type { ConfigEdit, PatchResult } from "../types.js";
import { detectEol, setEol } from "./eol.js";
import { isPlainObject } from "./merge.js";

/* magicast proxies are dynamically shaped; narrow access is intentional. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Resolve the config object even when wrapped in `defineConfig({...})`. */
function resolveConfigObject(mod: ReturnType<typeof parseModule>): any {
  const def: any = (mod.exports as any).default;
  if (def && def.$type === "function-call") return def.$args[0];
  return def;
}

/** Normalize an expression's source text for duplicate comparison. */
function norm(code: string): string {
  return code.replace(/\s+/g, "");
}

function applyEnsureImports(
  mod: ReturnType<typeof parseModule>,
  ensureImport: Record<string, string>,
): void {
  const items = mod.imports.$items;
  for (const [local, from] of Object.entries(ensureImport)) {
    const exists = items.some((i) => i.local === local && i.from === from);
    if (!exists) {
      mod.imports.$append({ local, imported: "default", from });
    }
  }
}

function applyAddToArray(
  configObj: any,
  path: string,
  value: string,
): void {
  const segments = path.split(".");
  const key = segments.pop()!;
  let parent = configObj;
  for (const seg of segments) parent = parent[seg];

  let arr = parent[key];
  if (!arr || arr.$type !== "array") {
    parent[key] = [];
    arr = parent[key];
  }

  const wanted = norm(value);
  for (const el of arr as any[]) {
    if (norm(generateCode(el).code) === wanted) return; // already present
  }
  (arr as any[]).push(builders.raw(value));
}

function applyMerge(target: any, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    const cur = target[key];
    if (isPlainObject(value) && cur && cur.$type === "object") {
      applyMerge(cur, value);
    } else if (
      cur === value &&
      typeof value !== "object" // primitives already equal ⇒ skip
    ) {
      continue;
    } else {
      target[key] = value;
    }
  }
}

export function patchConfig(content: string, edit: ConfigEdit): PatchResult {
  const eol = detectEol(content);
  const mod = parseModule(content);

  if (edit.ensureImport) applyEnsureImports(mod, edit.ensureImport);

  if (edit.addToArray || edit.merge) {
    const configObj = resolveConfigObject(mod);
    if (edit.addToArray) {
      applyAddToArray(configObj, edit.addToArray.path, edit.addToArray.value);
    }
    if (edit.merge) applyMerge(configObj, edit.merge);
  }

  const generated = setEol(mod.generate().code, eol);
  if (generated === content) return { changed: false, content };
  return { changed: true, content: generated };
}
