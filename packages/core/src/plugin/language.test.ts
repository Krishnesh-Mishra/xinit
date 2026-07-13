import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RecordingCtx } from "./ctx.js";

function ctxFor(dir: string): RecordingCtx {
  return new RecordingCtx({
    appDir: dir,
    repoRoot: dir,
    answers: {},
    prompter: async (p) => p.default,
    file: () => "",
    capabilities: { install: true, exec: false, network: false },
  });
}

let dir: string;
beforeEach(() => {
  dir = path.join(os.tmpdir(), `initup-lang-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("ctx.language", () => {
  it("returns python when pyproject.toml is present", () => {
    fs.writeFileSync(path.join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    expect(ctxFor(dir).language()).toBe("python");
  });

  it("returns ts when a tsconfig.json is present", () => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}");
    expect(ctxFor(dir).language()).toBe("ts");
  });

  it("defaults to js", () => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    expect(ctxFor(dir).language()).toBe("js");
  });
});
