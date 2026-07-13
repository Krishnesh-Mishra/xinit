import { describe, expect, it } from "vitest";

import type { PluginManifest } from "@xinit/core";

import { pluginAppliesToApp } from "./plugins.js";

function manifest(over: Partial<PluginManifest>): PluginManifest {
  return {
    schemaVersion: 1,
    name: "p",
    displayName: "P",
    capabilities: { install: true, exec: false, network: false },
    ...over,
  };
}

describe("pluginAppliesToApp — languages filtering (SPEC §5)", () => {
  it("excludes a plugin whose languages omit the app's language", () => {
    const m = manifest({ languages: ["ts", "js"] });
    expect(pluginAppliesToApp(m, { language: "python" })).toBe(false);
    expect(pluginAppliesToApp(m, { language: "ts" })).toBe(true);
    expect(pluginAppliesToApp(m, { language: "js" })).toBe(true);
  });

  it("treats an omitted languages list as no restriction", () => {
    const m = manifest({});
    expect(pluginAppliesToApp(m, { language: "python" })).toBe(true);
    expect(pluginAppliesToApp(m, { language: "ts" })).toBe(true);
  });

  it("still applies framework/type constraints alongside languages", () => {
    const m = manifest({ appliesTo: { framework: "react" }, languages: ["ts"] });
    expect(pluginAppliesToApp(m, { framework: "react", language: "ts" })).toBe(
      true,
    );
    expect(pluginAppliesToApp(m, { framework: "next", language: "ts" })).toBe(
      false,
    );
    expect(pluginAppliesToApp(m, { framework: "react", language: "python" })).toBe(
      false,
    );
  });
});
