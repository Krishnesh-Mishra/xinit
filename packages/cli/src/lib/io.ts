import pc from "picocolors";

export interface IOOptions {
  json?: boolean;
  silent?: boolean;
}

/**
 * Output router that enforces XInit's stdout discipline (SPEC §8):
 *
 * - In `--json` mode, **stdout carries ONLY the machine-readable result**. Every
 *   line of human text, progress and prompt UI is sent to stderr, so a log line
 *   can never corrupt the JSON an agent parses.
 * - In human mode, human text goes to stdout as usual.
 * - `--silent` suppresses incidental progress (`info`) but never the final result.
 */
export class IO {
  readonly json: boolean;
  readonly silent: boolean;
  /** Colour helpers (human output only). */
  readonly c = pc;

  constructor(opts: IOOptions = {}) {
    this.json = opts.json ?? false;
    this.silent = opts.silent ?? false;
  }

  /** Where human-readable text is safe to write: stderr in JSON mode, else stdout. */
  private get humanStream(): NodeJS.WritableStream {
    return this.json ? process.stderr : process.stdout;
  }

  /** Incidental progress / status. Suppressed by `--silent`; never hits stdout in JSON mode. */
  info(msg = ""): void {
    if (this.silent) return;
    this.humanStream.write(msg + "\n");
  }

  /** Human note that ignores `--silent` (still routed off stdout in JSON mode). */
  note(msg = ""): void {
    this.humanStream.write(msg + "\n");
  }

  /** Emit the single JSON payload to stdout (JSON mode only). */
  result(obj: unknown): void {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  }

  /** Human-facing warning — always to stderr, coloured. */
  warn(msg: string): void {
    process.stderr.write(this.c.yellow(msg) + "\n");
  }

  /** Human-facing error — always to stderr, coloured. */
  error(msg: string): void {
    process.stderr.write(this.c.red(msg) + "\n");
  }
}
