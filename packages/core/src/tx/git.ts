/**
 * Git working-tree guard (SPEC §6.6): "Refuse to run on a dirty git tree
 * without --force."
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Returns whether it is safe (from git's perspective) to start mutating `root`.
 *
 * Behavior:
 * - Git repo with a clean working tree → `true`.
 * - Git repo with uncommitted changes/untracked files → `false`.
 * - `root` is not a git repository → `true` (there is no dirty state to guard
 *   against; the caller has nothing to lose to an untracked mutation).
 * - `git` is not installed → `true` (same reasoning — cleanliness is
 *   undeterminable, so this check imposes no restriction).
 *
 * In short: `false` only when `root` is a git repo AND its tree is dirty.
 */
export async function isWorkingTreeClean(root: string): Promise<boolean> {
  try {
    const { stdout } = await run("git", ["status", "--porcelain"], {
      cwd: root,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout.trim() === "";
  } catch (err) {
    if (isNonGit(err)) return true;
    throw err;
  }
}

/** True when the failure means "no git to check" rather than a real error. */
function isNonGit(err: unknown): boolean {
  const e = err as { code?: unknown; stderr?: unknown };
  // spawn failure: git binary missing.
  if (e.code === "ENOENT") return true;
  // non-zero exit: git prints this when run outside a repository.
  const stderr = typeof e.stderr === "string" ? e.stderr : "";
  return /not a git repository/i.test(stderr);
}
