import { describe, expect, it } from "vitest";

import { wrapJsx } from "./wrap.js";
import type { WrapSpec } from "../types.js";

const MAIN = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

const APP = `export default function App() {
  return (
    <main>
      <h1>Hello</h1>
    </main>
  );
}
`;

describe("wrapJsx — render site", () => {
  it("wraps the first JSX argument of a *.render() call and adds the import", () => {
    const spec: WrapSpec = { component: "HeroUIProvider", from: "@heroui/react" };
    const r = wrapJsx(MAIN, [spec]);

    expect(r.changed).toBe(true);
    expect(r.unresolved).toBeFalsy();
    expect(r.content).toContain("<HeroUIProvider>");
    expect(r.content).toContain("</HeroUIProvider>");
    // Import added, named form.
    expect(r.content).toMatch(
      /import\s+\{\s*HeroUIProvider\s*\}\s+from\s+"@heroui\/react"/,
    );
    // Original StrictMode content preserved inside.
    expect(r.content).toContain("<StrictMode>");
    expect(r.content).toContain("<App />");
  });

  it("supports a default import", () => {
    const r = wrapJsx(MAIN, [
      { component: "Provider", from: "my-lib", import: "default" },
    ]);
    expect(r.content).toMatch(/import\s+Provider\s+from\s+"my-lib"/);
  });
});

describe("wrapJsx — default component", () => {
  it("wraps the JSX returned by a default-exported component", () => {
    const r = wrapJsx(APP, [{ component: "View", from: "react-native" }]);
    expect(r.changed).toBe(true);
    expect(r.content).toContain("<View>");
    expect(r.content).toContain("</View>");
    expect(r.content).toContain("<main>");
    expect(r.content).toMatch(/import\s+\{\s*View\s*\}\s+from\s+"react-native"/);
  });
});

describe("wrapJsx — props convention", () => {
  it("string values become string-literal attrs; {…} values become expression containers", () => {
    const r = wrapJsx(MAIN, [
      {
        component: "Provider",
        from: "lib",
        props: { title: "hi", style: "{{ flex: 1 }}", enabled: "{true}" },
      },
    ]);
    expect(r.content).toContain('title="hi"');
    // Expression container (formatting-tolerant): style={{ … flex: 1 … }}.
    expect(r.content).toMatch(/style=\{\{[\s\S]*flex:\s*1[\s\S]*\}\}/);
    expect(r.content).toContain("enabled={true}");
    // No parse-only parenthesization leaked through.
    expect(r.content).not.toContain("({");
  });
});

describe("wrapJsx — nesting", () => {
  it("nests multiple wrappers outermost-first", () => {
    const wrappers: WrapSpec[] = [
      { component: "Outer", from: "a" },
      { component: "Inner", from: "b" },
    ];
    const r = wrapJsx(APP, wrappers);
    expect(r.changed).toBe(true);
    const outer = r.content.indexOf("<Outer>");
    const inner = r.content.indexOf("<Inner>");
    const main = r.content.indexOf("<main>");
    expect(outer).toBeGreaterThanOrEqual(0);
    expect(inner).toBeGreaterThan(outer);
    expect(main).toBeGreaterThan(inner);
  });
});

describe("wrapJsx — idempotency", () => {
  it("a second run over already-wrapped output is a no-op", () => {
    const wrappers: WrapSpec[] = [
      { component: "Outer", from: "a" },
      { component: "Inner", from: "b" },
    ];
    const first = wrapJsx(APP, wrappers);
    expect(first.changed).toBe(true);

    const second = wrapJsx(first.content, wrappers);
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("single-wrapper render-site re-run is a no-op", () => {
    const spec: WrapSpec = { component: "HeroUIProvider", from: "@heroui/react" };
    const first = wrapJsx(MAIN, [spec]);
    const second = wrapJsx(first.content, [spec]);
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });
});

describe("wrapJsx — unresolvable", () => {
  it("returns changed:false + unresolved for a file with no render site / component", () => {
    const util = `export const add = (a: number, b: number) => a + b;\n`;
    const r = wrapJsx(util, [{ component: "Provider", from: "lib" }]);
    expect(r.changed).toBe(false);
    expect(r.unresolved).toBe(true);
    expect(r.content).toBe(util);
  });
});
