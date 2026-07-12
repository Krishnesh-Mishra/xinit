import { describe, it, expect } from "vitest";
import { ensureImport } from "./index.js";

describe("ensureImport", () => {
  it("adds a side-effect import after existing imports", () => {
    const src = `import { defineConfig } from "vite";\n\nexport default defineConfig({});\n`;
    const r = ensureImport(src, { import: "./styles.css" });
    expect(r.changed).toBe(true);
    const lines = r.content.split("\n");
    // inserted right after the last import, not blind-appended to EOF
    expect(lines[1]).toBe('import "./styles.css";');
  });

  it("adds at the top when there are no imports", () => {
    const r = ensureImport("const x = 1;\n", { import: "./styles.css" });
    expect(r.content.startsWith('import "./styles.css";\n')).toBe(true);
  });

  it("is idempotent for a bare import", () => {
    const src = `import "./styles.css";\nconst x = 1;\n`;
    const r = ensureImport(src, { import: "./styles.css" });
    expect(r.changed).toBe(false);
    expect(r.content).toBe(src);
  });

  it("detects an existing default import of the same module", () => {
    const src = `import styles from "./styles.css";\n`;
    const r = ensureImport(src, { import: "./styles.css" });
    expect(r.changed).toBe(false);
  });

  it("CRLF: no duplicate + preserves CRLF", () => {
    const src = `import "./styles.css";\r\nconst x = 1;\r\n`;
    const r = ensureImport(src, { import: "./styles.css" });
    expect(r.changed).toBe(false);
    expect(r.content).toBe(src);
  });

  it("CRLF: inserts with CRLF endings", () => {
    const src = `import a from "a";\r\nconst x = 1;\r\n`;
    const r = ensureImport(src, { import: "./styles.css" });
    expect(r.changed).toBe(true);
    expect(r.content).toContain("\r\n");
    expect(r.content).not.toMatch(/[^\r]\n/);
    expect(r.content.split("\r\n")[1]).toBe('import "./styles.css";');
  });

  it("ensures a call() statement and is idempotent", () => {
    const src = `import "./init.js";\n`;
    const first = ensureImport(src, { import: "./init.js", call: "init()" });
    expect(first.changed).toBe(true);
    expect(first.content).toContain("init();");
    const second = ensureImport(first.content, {
      import: "./init.js",
      call: "init()",
    });
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });
});
