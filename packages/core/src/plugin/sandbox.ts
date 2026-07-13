/**
 * Sandbox (SPEC §7) — the only bridge between plugin code and the host.
 *
 * `InProcessSandbox` evaluates the bundled CJS setup() source in-process and
 * invokes its default export with the recording `ctx`. Pure computation runs
 * freely; every effect must go through `ctx` (a RecordingCtx here), so nothing
 * touches disk until the resulting Plan is applied.
 *
 * SECURITY / FUTURE: this in-process evaluator is the v1 stub for *first-party*
 * plugins only. Node's `Function`/`vm` are NOT a security boundary (known
 * escapes). Before untrusted, pasted third-party plugins run unattended, this
 * implementation MUST be replaced with a true isolate (QuickJS→WASM or a
 * locked-down child process) behind this same `Sandbox` interface. Tracked in
 * FUTURE.md. `require` is stubbed to throw so accidental host access surfaces
 * loudly rather than silently succeeding.
 */
import type { Answers, Ctx, Sandbox } from "../types.js";

function blockedRequire(id: string): never {
  throw new Error(`require("${id}") is blocked in the plugin sandbox`);
}

export class InProcessSandbox implements Sandbox {
  async run(setupSource: string, ctx: Ctx, answers: Answers): Promise<void> {
    if (setupSource.trim() === "") return; // pure-install plugin: nothing to run

    const module: { exports: Record<string, unknown> } = { exports: {} };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const evaluate = new Function("module", "exports", "require", setupSource);
    evaluate(module, module.exports, blockedRequire);

    const exported = module.exports as Record<string, unknown>;
    const setup = (exported.default ?? exported) as unknown;
    if (typeof setup !== "function") {
      throw new Error("plugin setup bundle has no default-exported function");
    }

    await (setup as (c: Ctx, a: Answers) => void | Promise<void>)(ctx, answers);
  }
}
