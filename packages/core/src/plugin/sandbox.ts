/**
 * Sandbox (SPEC §7) — the only bridge between plugin code and the host.
 *
 * `InProcessSandbox` evaluates the bundled CJS setup() source in-process behind
 * the sandbox shim (`shimRequire`: the authoring SDK resolves to identities,
 * every other `require` throws) and invokes the plugin's setup with the
 * recording `ctx`. Pure computation runs freely; every effect must go through
 * `ctx` (a RecordingCtx here), so nothing touches disk until the resulting Plan
 * is applied. The bundle's default export may be a bare setup FUNCTION (old
 * `setup.ts`) or a definition OBJECT (typed form) — `resolveSetupFn` handles both.
 *
 * SECURITY / FUTURE: this in-process evaluator is the v1 stub for *first-party*
 * plugins only. Node's `Function`/`vm` are NOT a security boundary (known
 * escapes). Before untrusted, pasted third-party plugins run unattended, this
 * implementation MUST be replaced with a true isolate (QuickJS→WASM or a
 * locked-down child process) behind this same `Sandbox` interface. Tracked in
 * FUTURE.md.
 */
import type { Answers, Ctx, Sandbox } from "../types.js";
import { evalModule, resolveSetupFn } from "./shim.js";

export class InProcessSandbox implements Sandbox {
  async run(setupSource: string, ctx: Ctx, answers: Answers): Promise<void> {
    if (setupSource.trim() === "") return; // pure-install plugin: nothing to run

    const setup = resolveSetupFn(evalModule(setupSource));
    await setup(ctx, answers);
  }
}
