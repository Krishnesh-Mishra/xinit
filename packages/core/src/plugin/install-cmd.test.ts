/**
 * Unit coverage for `installCommands` — the manager-aware install-command
 * builder. Verifies each supported manager's syntax, the prod/dev split, the
 * `"pnpm+turbo"` compound normalization, the unknown-manager pnpm default, and
 * empty-dep-list skipping.
 */
import { describe, expect, it } from "vitest";
import { installCommands } from "./install-cmd.js";

describe("installCommands — per-manager syntax", () => {
  it("pnpm", () => {
    expect(installCommands("pnpm", ["react"], ["vite"])).toEqual([
      "pnpm add react",
      "pnpm add -D vite",
    ]);
  });

  it("npm", () => {
    expect(installCommands("npm", ["react"], ["vite"])).toEqual([
      "npm install react",
      "npm install -D vite",
    ]);
  });

  it("yarn", () => {
    expect(installCommands("yarn", ["react"], ["vite"])).toEqual([
      "yarn add react",
      "yarn add -D vite",
    ]);
  });

  it("bun (lowercase -d for dev)", () => {
    expect(installCommands("bun", ["react"], ["vite"])).toEqual([
      "bun add react",
      "bun add -d vite",
    ]);
  });

  it("uv", () => {
    expect(installCommands("uv", ["httpx"], ["ruff"])).toEqual([
      "uv add httpx",
      "uv add --dev ruff",
    ]);
  });

  it("poetry (--group dev)", () => {
    expect(installCommands("poetry", ["httpx"], ["pytest"])).toEqual([
      "poetry add httpx",
      "poetry add --group dev pytest",
    ]);
  });

  it("pip has no dev/prod split — both use `pip install`", () => {
    expect(installCommands("pip", ["httpx"], ["pytest"])).toEqual([
      "pip install httpx",
      "pip install pytest",
    ]);
  });
});

describe("installCommands — normalization & edge cases", () => {
  it("normalizes a compound manager like `pnpm+turbo` to its base tool", () => {
    expect(installCommands("pnpm+turbo", ["react"], [])).toEqual([
      "pnpm add react",
    ]);
  });

  it("defaults an unknown manager to pnpm", () => {
    expect(installCommands("unknown", ["react"], ["vite"])).toEqual([
      "pnpm add react",
      "pnpm add -D vite",
    ]);
    expect(installCommands("", ["react"], [])).toEqual(["pnpm add react"]);
  });

  it("joins multiple deps with spaces", () => {
    expect(installCommands("uv", ["httpx", "pydantic"], [])).toEqual([
      "uv add httpx pydantic",
    ]);
  });

  it("skips an empty prod list — emits only the dev command", () => {
    expect(installCommands("pnpm", [], ["vitest"])).toEqual(["pnpm add -D vitest"]);
  });

  it("skips an empty dev list — emits only the prod command", () => {
    expect(installCommands("uv", ["httpx"], [])).toEqual(["uv add httpx"]);
  });

  it("returns nothing when both lists are empty", () => {
    expect(installCommands("poetry", [], [])).toEqual([]);
  });
});
