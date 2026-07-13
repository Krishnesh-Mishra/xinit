/**
 * End-to-end for the `mongodb` retrofit: `ctx.ensureImport` must BIND `connectDB`
 * (previously a latent bug — the call was emitted with no import) and ensure the
 * `connectDB()` call in the Express entry, plus upsert MONGODB_URI via setEnv.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addPlugin, pack } from "./index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const MONGODB_DIR = path.join(REPO_ROOT, "plugins", "mongodb");

let work: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `xinit-mongodb-${randomUUID()}`);
  await fsp.mkdir(path.join(work, "src"), { recursive: true });
  await fsp.writeFile(
    path.join(work, "package.json"),
    JSON.stringify({ name: "demo", type: "module", dependencies: {} }, null, 2) +
      "\n",
  );
  await fsp.writeFile(
    path.join(work, "src", "server.ts"),
    'import express from "express";\nconst app = express();\napp.listen(3000);\n',
  );
});

afterEach(async () => {
  await fsp.rm(work, { recursive: true, force: true });
});

const read = (rel: string) => fs.readFileSync(path.join(work, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(work, rel));

describe("mongodb plugin", () => {
  it("binds connectDB via a named import and ensures the call", async () => {
    const manifest = await pack(MONGODB_DIR);
    const result = await addPlugin({
      pluginDirOrManifest: manifest,
      appDir: work,
      answers: { dbName: "shop" },
      installer: async () => {},
    });

    expect(result.status).toBe("success");
    expect(result.installed).toContain("mongoose");

    // The connection module was copied.
    expect(exists("src/config/mongo.ts")).toBe(true);

    const server = read("src/server.ts");
    // Bug fix: connectDB is now actually imported (named), not called unbound.
    expect(server).toMatch(
      /import\s+\{[^}]*connectDB[^}]*\}\s+from\s+"\.\/config\/mongo"/,
    );
    expect(server).toContain("connectDB();");

    // Env upsert + example seeding.
    expect(read(".env")).toContain(
      "MONGODB_URI=mongodb://localhost:27017/shop",
    );
    expect(read(".env.example")).toContain(
      "MONGODB_URI=mongodb://localhost:27017/shop",
    );
  });

  it("is idempotent — a second apply does not duplicate the import or call", async () => {
    const manifest = await pack(MONGODB_DIR);
    const opts = {
      pluginDirOrManifest: manifest,
      appDir: work,
      installer: async () => {},
    };
    await addPlugin(opts);
    const serverAfter1 = read("src/server.ts");

    const second = await addPlugin(opts);
    expect(second.status).toBe("success");

    const serverAfter2 = read("src/server.ts");
    expect(serverAfter2).toBe(serverAfter1);
    expect(serverAfter2.match(/connectDB\(\);/g)?.length).toBe(1);
    expect(serverAfter2.match(/from "\.\/config\/mongo"/g)?.length).toBe(1);
  });
});
