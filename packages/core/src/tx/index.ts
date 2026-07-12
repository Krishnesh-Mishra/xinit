/**
 * Transaction subsystem (SPEC §6.6): snapshot → apply → commit | rollback,
 * plus the git working-tree guard.
 */
export { createTransaction } from "./transaction.js";
export type { CreateTransactionOptions } from "./transaction.js";
export { isWorkingTreeClean } from "./git.js";
