# Execution model & safety

Why XInit can run scripted, imperative plugin code and still give you a dry-run
plan, consent, idempotency, and rollback. This is the heart of the design
(SPEC §5–§8); the source of truth for the shapes named here is
`packages/core/src/types.ts`.

- [Reads immediate, writes deferred](#reads-immediate-writes-deferred)
- [The Plan](#the-plan)
- [The consent gate](#the-consent-gate)
- [The MCP confirm-token handshake](#the-mcp-confirm-token-handshake)
- [Transaction & rollback](#transaction--rollback)
- [Idempotency rules](#idempotency-rules)
- [Sandbox & capabilities](#sandbox--capabilities)
- [Why plugins are safe](#why-plugins-are-safe)

---

## Reads immediate, writes deferred

The tension: we want a **dry-run plan + consent** *and* imperative code that can
branch on the project's actual state. The resolution is to split `ctx` into two
kinds of calls:

- **Reads run immediately.** `ctx.exists`, `ctx.readJson`, `ctx.readText`,
  `ctx.prompt`, and the resolvers (`entryFile`, `stylesheet`, `configFile`,
  `find`, `findOrCreate`, `envFile`) inspect real disk state and return a value
  *now*, so `setup()` can branch with plain `if`. Prompts are side-effect-free, so
  conditional/follow-up questions live here — not in a JSON DSL.
- **Writes are recorded, not applied.** `ctx.install`, `ctx.installDev`,
  `ctx.copy`, `ctx.addFile`, `ctx.patchJson`, `ctx.patchConfig`, `ctx.patchToml`,
  `ctx.ensureLine`, `ctx.setEnv`, `ctx.ensureImport`, `ctx.wrap`, `ctx.setScript`,
  and `ctx.run` append an entry to an internal op list. **Nothing touches disk
  during `setup()`.** Running `setup()` produces a **Plan**.

The `create`-style resolvers (`stylesheet({ createIfMissing: true })`,
`findOrCreate`) blur the line usefully: they read *now* to decide, and if they
must create, they record a deferred write and let later ops compose onto it via the
plan overlay.

`ctx.run` (arbitrary exec) is the one weak spot: its effect is opaque, so its plan
entry is just the **command string**, not a diff. That is a documented tradeoff —
**exec plugins get a weaker safety guarantee than patch plugins.**

## The Plan

Running `setup()` yields a `Plan` — the exact, reviewable description of what
*would* happen:

```ts
interface Plan {
  plugin: string;
  steps: PlanStep[];      // one per write op, with a summary and (for files) a diff
  installs: { packages: string[]; dev: string[] };
  commands: string[];     // exec commands, if any (weak-guarantee ops)
  capabilities: Capability[];
  warnings: string[];     // manual steps surfaced via ctx.warn
  requiresConfirmation: boolean;
  confirmToken?: string;  // hash of this exact Plan — for the MCP handshake
}
```

Each `PlanStep` carries `kind` (the op name), a one-line `summary`, an optional
`file`, a unified-diff-ish `diff` for file changes (never opaque base64), and the
raw `detail` op. Applying a plugin returns an `ApplyResult`:

```ts
interface ApplyResult {
  status: "success" | "rolled_back" | "confirmation_required";
  plugin: string;
  installed: string[];
  created: string[];
  modified: string[];
  commands: string[];
  warnings: string[];
  confirmToken?: string;  // present when status === "confirmation_required"
  plan?: Plan;
}
```

## The consent gate

Nothing is written until the Plan is approved.

- **Interactive CLI** (`xinit`, `xinit manage`, or `xinit add` without flags): the
  Plan is shown and you confirm before it applies.
- **Effect-free trusted plugins** (first-party, or third-party install-only — no
  `exec`/`network`) apply without an extra gate.
- **Plugins declaring `exec` or `network`** require explicit approval: `--yes` on
  the CLI, or the confirm-token handshake over MCP.

`--yes` auto-approves; `--silent` removes interactivity (prompts fall back to
defaults); `--json` keeps stdout pure JSON for scripts and agents. See
[using-plugins.md](./using-plugins.md#scripts--ai---json-and---silent).

## The MCP confirm-token handshake

No interactive prompt exists for an agent, so "are you sure?" becomes a **required
second call** (SPEC §8):

| Case | Behavior |
| --- | --- |
| first-party (official) | run immediately |
| third-party, install-only (no `exec`/`network`) | run immediately, flagged in the response |
| third-party needing `exec` or `network` | **do not run** → return `{ status: "confirmation_required", plan, confirmToken }` |

To proceed, the agent re-calls the same tool with the same args **plus**
`confirm: "<confirmToken>"`:

```jsonc
add_plugin({ "plugin": "./shadcn.json", "app": "web" })
// → { "status": "confirmation_required", "plan": {…}, "confirmToken": "abc123" }

add_plugin({ "plugin": "./shadcn.json", "app": "web", "confirm": "abc123" })
// → runs, returns the ApplyResult
```

`confirmToken` is a **hash of the exact computed Plan**, so a confirmation cannot be
replayed against a different action: if the Plan changes, the old token no longer
matches and is rejected. With the sandbox, this is the full defense when no human
is in the loop.

## Transaction & rollback

Applying a Plan is transactional (SPEC §6.6):

1. **Snapshot** every file an op will touch — plus `package.json` and the lockfile —
   before applying anything (`Transaction.track(absPath)`, idempotent per path).
2. **Apply** the ops.
3. On success, **commit** (discard snapshots). On **any failure**, **rollback** —
   every tracked file is restored to its snapshot, and the `ApplyResult.status`
   comes back `rolled_back` (the CLI exits `1`).

XInit refuses to run on a dirty git tree without `--force`, so a rollback returns
you to a clean, known state.

## Idempotency rules

These are contract-level requirements (SPEC §6), not nice-to-haves:

1. **`detect` is UX only.** It lists installed plugins for the wizard/listings. It
   is **not** the idempotency mechanism — a plugin that crashed mid-run leaves the
   dependency present but the project half-patched, and `detect` would wrongly say
   "done". Safety comes from rule #2.
2. **Every write op is independently idempotent.** Re-running no-ops if already
   applied: `ensureLine` skips a present line, `addToArray` skips a present entry,
   `install` skips a satisfied dep, `setEnv` never overwrites a non-empty value,
   `wrap` no-ops a tree already wrapped, `findOrCreate` doesn't rewrite an existing
   file. As an author you don't write idempotency checks — you pick the right op.
3. **Line endings are normalized before compare/insert.** A CRLF file checked
   against an LF line still matches, so `ensureLine`/`ensureImport` never duplicate
   on Windows.
4. **AST/line inserts are position-aware.** Import order can be load-bearing
   (Tailwind's `@import` must precede HeroUI's). Never blind-append — use
   `position`/`after` and the structured `patchConfig`/`ensureImport` ops.
5. **Installs are batched.** Deps are collected across the resolved plan and
   installed once at commit, workspace-aware.

## Sandbox & capabilities

> **Computation is free; effects are declared capabilities.**

`setup()` runs in a sandbox. Pure JS (Math, JSON, strings, loops, `if`) is always
allowed. Every way of touching the outside world is a **capability**, declared in
the manifest, surfaced in the Plan, and gated by consent:

| The code wants to… | Allowed? |
| --- | --- |
| Math / string / loop / `if` / JSON | ✅ always (pure) |
| `console.log` | ✅ captured to a log channel (never raw stdout — would corrupt `--json`) |
| install a package | ⚠️ via `ctx.install` + `capabilities.install`; recorded + reversible |
| run a command (exec) | ⚠️ via `ctx.run` + `capabilities.exec` + consent; weak plan only |
| read/write files | ⚠️ via `ctx.*`; recorded → dry-run + rollback (needs no capability flag) |
| network / `fetch` | ⚠️ requires `capabilities.network` + consent |
| `require('child_process')`, `fs`, `process`, arbitrary `import` | ❌ blocked entirely |

`ctx` is the **only** bridge between plugin code and the host. Node's built-in `vm`
is not a security boundary; for untrusted pasted code the sandbox must be a true
isolate (QuickJS→WASM or a locked-down child process). v1 may ship an in-process
stub behind the `Sandbox` interface for first-party plugins; the hardened isolate
is required before open third-party plugins run unattended (tracked in
[`../FUTURE.md`](../FUTURE.md)).

> **Open ≠ unrestricted.** Anyone may publish/paste a plugin (low friction), but
> pasted code can *compute* freely and can only *touch* the machine through
> declared, consented capabilities.

## Why plugins are safe

Putting it together, an XInit plugin is safe in a way a docs-augmented AI acting
directly cannot match:

- **You see the Plan before anything happens** — a real dry run with diffs.
- **Every effect is a declared capability**, and `exec`/`network` demand explicit
  consent (a confirm-token an agent cannot forge, because it hashes the Plan).
- **Applying is transactional** — any failure rolls the whole project back.
- **Re-running is a no-op** — per-op idempotency, CRLF-safe, position-aware.
- **Computation is sandboxed** — `ctx` is the only door to the machine.

That is XInit's moat: determinism, idempotency, transactional rollback, and
machine-readable state — the guarantees the tool provides so the human or agent
driving it doesn't have to.

---

**See also:** [using-plugins.md](./using-plugins.md) ·
[authoring-plugins.md](./authoring-plugins.md) ·
[ctx-reference.md](./ctx-reference.md) · [examples.md](./examples.md) ·
[`../SPEC.md`](../SPEC.md) §5–§8 · [`../FUTURE.md`](../FUTURE.md).
