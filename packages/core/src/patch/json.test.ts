import { describe, it, expect } from "vitest";
import { patchJson } from "./index.js";

describe("patchJson", () => {
  it("deep-merges nested keys, preserving siblings", () => {
    const src = `{\n  "name": "app",\n  "scripts": {\n    "build": "tsup"\n  }\n}\n`;
    const r = patchJson(src, { scripts: { dev: "vite" } });
    expect(r.changed).toBe(true);
    const parsed = JSON.parse(r.content);
    expect(parsed.name).toBe("app");
    expect(parsed.scripts.build).toBe("tsup");
    expect(parsed.scripts.dev).toBe("vite");
  });

  it("is idempotent", () => {
    const src = `{\n  "scripts": {\n    "build": "tsup"\n  }\n}\n`;
    const first = patchJson(src, { scripts: { dev: "vite" } });
    const second = patchJson(first.content, { scripts: { dev: "vite" } });
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("no-op when value already present", () => {
    const src = `{ "a": 1, "b": { "c": 2 } }`;
    const r = patchJson(src, { b: { c: 2 } });
    expect(r.changed).toBe(false);
    expect(r.content).toBe(src);
  });

  it("preserves comments (JSONC)", () => {
    const src = `{\n  // keep me\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`;
    const r = patchJson(src, { compilerOptions: { target: "ES2022" } });
    expect(r.changed).toBe(true);
    expect(r.content).toContain("// keep me");
    expect(r.content).toContain('"target": "ES2022"');
    expect(r.content).toContain('"strict": true');
  });

  it("preserves 4-space indentation", () => {
    const src = `{\n    "a": 1\n}\n`;
    const r = patchJson(src, { b: 2 });
    expect(r.content).toContain('    "b": 2');
  });

  it("CRLF: preserves CRLF endings", () => {
    const src = `{\r\n  "a": 1\r\n}\r\n`;
    const r = patchJson(src, { b: 2 });
    expect(r.changed).toBe(true);
    expect(r.content).toContain("\r\n");
    expect(r.content).not.toMatch(/[^\r]\n/);
  });

  it("handles empty content", () => {
    const r = patchJson("", { a: 1 });
    expect(r.changed).toBe(true);
    expect(JSON.parse(r.content)).toEqual({ a: 1 });
  });

  it("overwrites a differing primitive", () => {
    const r = patchJson(`{ "a": 1 }`, { a: 2 });
    expect(r.changed).toBe(true);
    expect(JSON.parse(r.content).a).toBe(2);
  });
});
