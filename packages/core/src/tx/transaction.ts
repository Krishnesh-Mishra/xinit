/**
 * File-snapshot transaction (SPEC §6.6).
 *
 * Makes a set of file mutations atomic. Before a file is created or mutated,
 * `track()` snapshots its current bytes (or records that it was absent). On
 * `rollback()` every tracked file is restored to that snapshot and files that
 * were absent at track time are deleted; `commit()` simply discards snapshots.
 *
 * Byte-exact: snapshots and restores go through Buffers, so encoding and line
 * endings (CRLF/LF, BOM, binary) are preserved untouched.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { Transaction } from "../types.js";

export interface CreateTransactionOptions {
  /**
   * Base directory under which this transaction's private snapshot folder is
   * created. Defaults to the OS temp dir. A unique `xinit-tx-<uuid>` subfolder
   * is always created inside it, so concurrent transactions never collide and
   * cleanup never touches a caller-provided directory itself.
   */
  snapshotDir?: string;
}

interface TrackedEntry {
  /** Whether the file existed on disk when it was first tracked. */
  existed: boolean;
  /** Path to the saved snapshot bytes — present iff `existed`. */
  snapshotPath?: string;
}

/**
 * Create a file-snapshot transaction. Snapshots live in a unique temp folder
 * that is removed on `commit()` or `rollback()`.
 */
export function createTransaction(opts?: CreateTransactionOptions): Transaction {
  const base = opts?.snapshotDir ?? os.tmpdir();
  const snapshotRoot = path.join(base, `xinit-tx-${randomUUID()}`);

  // Insertion-ordered so rollback restores in track order.
  const tracked = new Map<string, TrackedEntry>();
  let nextId = 0;
  let dirReady = false;
  /** Set once commit()/rollback() has run — the transaction is then inert. */
  let settled = false;

  async function ensureSnapshotDir(): Promise<void> {
    if (!dirReady) {
      await fs.mkdir(snapshotRoot, { recursive: true });
      dirReady = true;
    }
  }

  async function cleanup(): Promise<void> {
    // Best-effort: a failed cleanup must not mask the operation's outcome.
    await fs.rm(snapshotRoot, { recursive: true, force: true }).catch(() => {});
    dirReady = false;
  }

  return {
    async track(absPath: string): Promise<void> {
      if (settled) {
        throw new Error("transaction already settled; cannot track new files");
      }
      const key = path.resolve(absPath);
      // Idempotent per path: the FIRST snapshot wins.
      if (tracked.has(key)) return;

      let data: Buffer;
      try {
        data = await fs.readFile(key);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          // Absent now → rollback should delete whatever gets created.
          tracked.set(key, { existed: false });
          return;
        }
        throw err;
      }

      await ensureSnapshotDir();
      const snapshotPath = path.join(snapshotRoot, `${nextId++}.snap`);
      await fs.writeFile(snapshotPath, data);
      tracked.set(key, { existed: true, snapshotPath });
    },

    async commit(): Promise<void> {
      if (settled) return;
      settled = true;
      await cleanup();
      tracked.clear();
    },

    async rollback(): Promise<void> {
      if (settled) return;
      settled = true;
      for (const [target, entry] of tracked) {
        if (entry.existed && entry.snapshotPath) {
          const data = await fs.readFile(entry.snapshotPath);
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, data);
        } else {
          // Was absent at track time → remove whatever was created.
          await fs.rm(target, { force: true }).catch(() => {});
        }
      }
      await cleanup();
      tracked.clear();
    },
  };
}
