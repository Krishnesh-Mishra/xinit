import { describe, it, expect } from "vitest";
import { patchConfig } from "./index.js";

const VITE = `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
`;

describe("patchConfig — addToArray (vite plugins)", () => {
  it("adds the import and pushes into plugins", () => {
    const r = patchConfig(VITE, {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });
    expect(r.changed).toBe(true);
    expect(r.content).toContain(
      'import tailwindcss from "@tailwindcss/vite"',
    );
    expect(r.content).toMatch(/plugins:\s*\[react\(\),\s*tailwindcss\(\)\]/);
  });

  it("is a no-op if already present", () => {
    const applied = patchConfig(VITE, {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });
    const again = patchConfig(applied.content, {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });
    expect(again.changed).toBe(false);
    expect(again.content).toBe(applied.content);
  });

  it("preserves the react() plugin already in the array", () => {
    const r = patchConfig(VITE, {
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });
    expect(r.content).toContain("react()");
    expect(r.content).toContain("tailwindcss()");
  });

  it("works with a plain object default export", () => {
    const src = `export default {\n  plugins: [],\n};\n`;
    const r = patchConfig(src, {
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });
    expect(r.changed).toBe(true);
    expect(r.content).toContain("tailwindcss()");
  });
});

describe("patchConfig — merge", () => {
  it("deep-merges into the default export object", () => {
    const src = `export default defineConfig({\n  server: { port: 3000 },\n});\n`;
    const r = patchConfig(src, { merge: { server: { host: true } } });
    expect(r.changed).toBe(true);
    expect(r.content).toContain("port: 3000");
    expect(r.content).toContain("host: true");
  });

  it("merge is idempotent", () => {
    const src = `export default defineConfig({\n  server: { port: 3000 },\n});\n`;
    const first = patchConfig(src, { merge: { server: { host: true } } });
    const second = patchConfig(first.content, {
      merge: { server: { host: true } },
    });
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });
});
