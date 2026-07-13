import { randomUUID } from "node:crypto";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runDetect } from "./detect.js";

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-cli-detect-${randomUUID()}`);
  await fsp.mkdir(work, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

describe("runDetect", () => {
  it("returns the expected Project shape for a single-app Vite project", async () => {
    await fsp.writeFile(
      path.join(work, "package.json"),
      JSON.stringify(
        {
          name: "demo-app",
          dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
          devDependencies: { vite: "^6.0.0", typescript: "^5.7.0" },
        },
        null,
        2,
      ),
    );
    await fsp.writeFile(path.join(work, "tsconfig.json"), "{}");
    await fsp.writeFile(path.join(work, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    const project = await runDetect(work);

    expect(project.kind).toBe("single");
    expect(project.manager).toBe("pnpm");
    expect(path.isAbsolute(project.root)).toBe(true);
    expect(project.apps).toHaveLength(1);

    const app = project.apps[0]!;
    expect(app.name).toBe("demo-app");
    expect(app.path).toBe(".");
    expect(app.language).toBe("ts");
    expect(app.framework).toBe("react");
    expect(Array.isArray(app.plugins)).toBe(true);
    expect(project.packages).toEqual([]);
  });
});
