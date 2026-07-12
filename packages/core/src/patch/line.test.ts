import { describe, it, expect } from "vitest";
import { ensureLine } from "./index.js";

describe("ensureLine", () => {
  it("appends a missing line at the bottom by default", () => {
    const r = ensureLine("dist\nnode_modules\n", ".env");
    expect(r.changed).toBe(true);
    expect(r.content).toBe("dist\nnode_modules\n.env\n");
  });

  it("adds at the top when position:top", () => {
    const r = ensureLine("body {}\n", '@import "tailwindcss";', {
      position: "top",
    });
    expect(r.content).toBe('@import "tailwindcss";\nbody {}\n');
  });

  it("is idempotent (second call is a no-op)", () => {
    const first = ensureLine("dist\n", ".env");
    const second = ensureLine(first.content, ".env");
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("CRLF: does not duplicate a line already present in CRLF form", () => {
    const crlf = "dist\r\n.env\r\n";
    const r = ensureLine(crlf, ".env");
    expect(r.changed).toBe(false);
    expect(r.content).toBe(crlf);
  });

  it("CRLF: preserves CRLF endings when inserting", () => {
    const r = ensureLine("dist\r\nnode_modules\r\n", ".env");
    expect(r.changed).toBe(true);
    expect(r.content).toBe("dist\r\nnode_modules\r\n.env\r\n");
  });

  it("position-aware: places heroui import immediately AFTER tailwind", () => {
    const css = '@import "tailwindcss";\nbody { margin: 0; }\n';
    const r = ensureLine(css, '@import "@heroui/styles";', {
      after: '@import "tailwindcss";',
    });
    expect(r.changed).toBe(true);
    expect(r.content).toBe(
      '@import "tailwindcss";\n@import "@heroui/styles";\nbody { margin: 0; }\n',
    );
    // heroui must never precede tailwind
    const idxTw = r.content.indexOf("tailwindcss");
    const idxHero = r.content.indexOf("heroui");
    expect(idxTw).toBeLessThan(idxHero);
  });

  it("position-aware ordering is idempotent", () => {
    const css = '@import "tailwindcss";\n';
    const opts = { after: '@import "tailwindcss";' };
    const first = ensureLine(css, '@import "@heroui/styles";', opts);
    const second = ensureLine(first.content, '@import "@heroui/styles";', opts);
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("handles empty input", () => {
    const r = ensureLine("", "first");
    expect(r.changed).toBe(true);
    expect(r.content).toBe("first");
  });

  it("preserves a file without a trailing newline", () => {
    const r = ensureLine("dist", ".env");
    expect(r.content).toBe("dist\n.env");
  });
});
