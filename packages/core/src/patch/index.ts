// M1: patch engine — pure, idempotent, CRLF-safe file surgery (SPEC §5, §6, §10).
// All functions are string-in → PatchResult out; no filesystem access (the tx
// / runtime layer owns I/O). `changed: false` means the edit was already applied.

export { detectEol } from "./eol.js";
export { patchJson } from "./json.js";
export { patchConfig } from "./config.js";
export { ensureLine } from "./line.js";
export { ensureImport } from "./imports.js";
export { wrapJsx, type WrapResult } from "./wrap.js";
export { patchToml } from "./toml.js";
