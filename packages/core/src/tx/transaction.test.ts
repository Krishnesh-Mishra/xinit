import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTransaction } from "./transaction.js";

let work: string;
let snapshotBase: string;

beforeEach(async () => {
  work = path.join(os.tmpdir(), `initup-tx-test-${randomUUID()}`);
  snapshotBase = path.join(os.tmpdir(), `initup-tx-snap-${randomUUID()}`);
  await fs.mkdir(work, { recursive: true });
  await fs.mkdir(snapshotBase, { recursive: true });
});

afterEach(async () => {
  await fs.rm(work, { recursive: true, force: true });
  await fs.rm(snapshotBase, { recursive: true, force: true });
});

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("createTransaction", () => {
  it("restores original bytes of a tracked file after modification", async () => {
    const file = path.join(work, "config.txt");
    // Deliberately mixed line endings + trailing bytes to prove byte-fidelity.
    const original = Buffer.from("line1\r\nline2\nend", "utf8");
    await fs.writeFile(file, original);

    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.track(file);

    await fs.writeFile(file, Buffer.from("totally different", "utf8"));
    await tx.rollback();

    const restored = await fs.readFile(file);
    expect(restored.equals(original)).toBe(true);
  });

  it("preserves exact binary bytes", async () => {
    const file = path.join(work, "blob.bin");
    const original = Buffer.from([0x00, 0xff, 0x0d, 0x0a, 0x00, 0x42]);
    await fs.writeFile(file, original);

    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.track(file);
    await fs.writeFile(file, Buffer.from([0x01, 0x02]));
    await tx.rollback();

    const restored = await fs.readFile(file);
    expect(restored.equals(original)).toBe(true);
  });

  it("deletes a file that was absent at track time", async () => {
    const file = path.join(work, "new.txt");
    expect(await exists(file)).toBe(false);

    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.track(file);

    await fs.writeFile(file, "created during apply");
    expect(await exists(file)).toBe(true);

    await tx.rollback();
    expect(await exists(file)).toBe(false);
  });

  it("creates parent directories as needed on restore", async () => {
    const file = path.join(work, "nested", "deep", "file.txt");
    const original = Buffer.from("keep me", "utf8");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, original);

    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.track(file);

    // Remove the whole subtree, simulating an aggressive mutation.
    await fs.rm(path.join(work, "nested"), { recursive: true, force: true });
    await tx.rollback();

    const restored = await fs.readFile(file);
    expect(restored.equals(original)).toBe(true);
  });

  it("keeps the FIRST snapshot when a path is tracked twice", async () => {
    const file = path.join(work, "double.txt");
    await fs.writeFile(file, "A");

    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.track(file); // snapshot = "A"

    await fs.writeFile(file, "B");
    await tx.track(file); // ignored — must NOT re-snapshot "B"

    await fs.writeFile(file, "C");
    await tx.rollback();

    expect(await fs.readFile(file, "utf8")).toBe("A");
  });

  it("commit discards snapshots and does not restore", async () => {
    const file = path.join(work, "committed.txt");
    await fs.writeFile(file, "before");

    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.track(file);
    await fs.writeFile(file, "after");
    await tx.commit();

    // File keeps the mutated content.
    expect(await fs.readFile(file, "utf8")).toBe("after");
    // Snapshot folder is cleaned up — no leftover under the base dir.
    expect(await fs.readdir(snapshotBase)).toHaveLength(0);
  });

  it("rollback is safe after a partial apply (some files changed, some not)", async () => {
    const a = path.join(work, "a.txt");
    const b = path.join(work, "b.txt");
    const c = path.join(work, "c.txt"); // absent at track time
    await fs.writeFile(a, "a-original");
    await fs.writeFile(b, "b-original");

    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.track(a);
    await tx.track(b);
    await tx.track(c);

    // Only a and c actually got touched before a "failure".
    await fs.writeFile(a, "a-changed");
    await fs.writeFile(c, "c-created");

    await tx.rollback();

    expect(await fs.readFile(a, "utf8")).toBe("a-original");
    expect(await fs.readFile(b, "utf8")).toBe("b-original");
    expect(await exists(c)).toBe(false);
  });

  it("is idempotent: a second commit/rollback is a no-op and cleans up", async () => {
    const file = path.join(work, "idem.txt");
    await fs.writeFile(file, "x");

    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.track(file);
    await fs.writeFile(file, "y");
    await tx.commit();
    await tx.commit(); // must not throw
    await tx.rollback(); // settled — must not restore "x"

    expect(await fs.readFile(file, "utf8")).toBe("y");
  });

  it("throws when tracking after the transaction is settled", async () => {
    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.commit();
    await expect(tx.track(path.join(work, "late.txt"))).rejects.toThrow(
      /already settled/,
    );
  });

  it("commit/rollback with nothing tracked never creates a snapshot dir", async () => {
    const tx = createTransaction({ snapshotDir: snapshotBase });
    await tx.commit();
    expect(await fs.readdir(snapshotBase)).toHaveLength(0);
  });
});
