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

  it("adds a named import from a module", () => {
    const src = `const x = 1;\n`;
    const r = ensureImport(src, { named: ["useState"], from: "react" });
    expect(r.changed).toBe(true);
    expect(r.content.startsWith('import { useState } from "react";\n')).toBe(
      true,
    );
  });

  it("adds a default import from a module", () => {
    const r = ensureImport("", { default: "theme", from: "./theme" });
    expect(r.changed).toBe(true);
    expect(r.content).toContain('import theme from "./theme";');
  });

  it("emits default + named together", () => {
    const r = ensureImport("", {
      default: "React",
      named: ["useState"],
      from: "react",
    });
    expect(r.content).toContain('import React, { useState } from "react";');
  });

  it("merges a named binding into an existing import from the same module", () => {
    const src = `import { ChakraProvider } from "@chakra-ui/react";\n`;
    const r = ensureImport(src, {
      named: ["defaultSystem"],
      from: "@chakra-ui/react",
    });
    expect(r.changed).toBe(true);
    expect(r.content).toContain(
      'import { ChakraProvider, defaultSystem } from "@chakra-ui/react";',
    );
    // Only one import line from that module.
    const count = r.content.split("\n").filter((l) =>
      l.includes('from "@chakra-ui/react"'),
    ).length;
    expect(count).toBe(1);
  });

  it("adds a default alongside an existing named import from the module", () => {
    const src = `import { useQuery } from "@tanstack/react-query";\n`;
    const r = ensureImport(src, {
      default: "ReactQuery",
      from: "@tanstack/react-query",
    });
    expect(r.content).toContain(
      'import ReactQuery, { useQuery } from "@tanstack/react-query";',
    );
  });

  it("is idempotent for a named binding already present", () => {
    const src = `import { useState, useEffect } from "react";\n`;
    const r = ensureImport(src, { named: ["useState"], from: "react" });
    expect(r.changed).toBe(false);
    expect(r.content).toBe(src);
  });

  it("adds the named binding plus a call together", () => {
    const src = `import express from "express";\n`;
    const r = ensureImport(src, {
      named: ["connectDB"],
      from: "./config/mongo",
      call: "connectDB()",
    });
    expect(r.changed).toBe(true);
    expect(r.content).toContain('import { connectDB } from "./config/mongo";');
    expect(r.content).toContain("connectDB();");
    // Idempotent on a second run.
    const again = ensureImport(r.content, {
      named: ["connectDB"],
      from: "./config/mongo",
      call: "connectDB()",
    });
    expect(again.changed).toBe(false);
    expect(again.content).toBe(r.content);
  });

  it("CRLF: merges a named binding preserving CRLF", () => {
    const src = `import { A } from "m";\r\nconst x = 1;\r\n`;
    const r = ensureImport(src, { named: ["B"], from: "m" });
    expect(r.changed).toBe(true);
    expect(r.content).toContain('import { A, B } from "m";');
    expect(r.content).not.toMatch(/[^\r]\n/);
  });
});
