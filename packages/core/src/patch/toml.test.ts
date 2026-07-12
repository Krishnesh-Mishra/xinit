import { describe, it, expect } from "vitest";
import { parse } from "smol-toml";
import { patchToml } from "./index.js";

describe("patchToml", () => {
  it("deep-merges into an existing table", () => {
    const src = `[project]\nname = "app"\n`;
    const r = patchToml(src, { project: { version: "1.0.0" } });
    expect(r.changed).toBe(true);
    const parsed = parse(r.content) as any;
    expect(parsed.project.name).toBe("app");
    expect(parsed.project.version).toBe("1.0.0");
  });

  it("is idempotent", () => {
    const src = `[project]\nname = "app"\n`;
    const first = patchToml(src, { project: { version: "1.0.0" } });
    const second = patchToml(first.content, { project: { version: "1.0.0" } });
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("no-op (and preserves original formatting/comments) when already present", () => {
    const src = `# my project\n[project]\nname = "app"\nversion = "1.0.0"\n`;
    const r = patchToml(src, { project: { name: "app" } });
    expect(r.changed).toBe(false);
    expect(r.content).toBe(src); // comment + formatting untouched
  });

  it("handles empty content", () => {
    const r = patchToml("", { project: { name: "app" } });
    expect(r.changed).toBe(true);
    expect((parse(r.content) as any).project.name).toBe("app");
  });

  it("CRLF: emits CRLF endings when changed", () => {
    const src = `[project]\r\nname = "app"\r\n`;
    const r = patchToml(src, { project: { version: "1.0.0" } });
    expect(r.changed).toBe(true);
    expect(r.content).toContain("\r\n");
    expect(r.content).not.toMatch(/[^\r]\n/);
  });
});
