/**
 * Internal structural helpers: plain-object test, deep merge, deep equality.
 * Shared by the JSON and TOML patchers for no-op (idempotency) detection.
 */

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  if (Array.isArray(v) || v instanceof Date) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-merge `source` into `base`, returning a new value. Plain objects merge
 * recursively; everything else (primitives, arrays, dates) is replaced by
 * `source`. Never mutates its arguments.
 */
export function deepMerge(base: unknown, source: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(source)) return source;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(source)) {
    out[key] = deepMerge(base[key], source[key]);
  }
  return out;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(
      (k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]),
    );
  }
  return false;
}
