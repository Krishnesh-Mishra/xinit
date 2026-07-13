import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isWorkingTreeClean } from "./git.js";

const run = promisify(execFile);

let dir: string;

beforeEach(async () => {
  dir = path.join(os.tmpdir(), `initup-git-test-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("isWorkingTreeClean", () => {
  it("returns true for a directory that is not a git repository", async () => {
    expect(await isWorkingTreeClean(dir)).toBe(true);
  });

  it("returns true for a freshly initialized (clean) repo", async () => {
    await run("git", ["init"], { cwd: dir, windowsHide: true });
    expect(await isWorkingTreeClean(dir)).toBe(true);
  });

  it("returns false when the repo has an untracked file (dirty)", async () => {
    await run("git", ["init"], { cwd: dir, windowsHide: true });
    await fs.writeFile(path.join(dir, "unstaged.txt"), "hi");
    expect(await isWorkingTreeClean(dir)).toBe(false);
  });
});
