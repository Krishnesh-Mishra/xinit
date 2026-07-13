import { cancel, confirm, isCancel, multiselect, select, text } from "@clack/prompts";

import type { Answers, Prompt } from "@xinit/core";

/** Thrown when the user aborts an interactive prompt (Ctrl-C / Esc). */
export class CancelledError extends Error {
  constructor() {
    super("Operation cancelled.");
    this.name = "CancelledError";
  }
}

export type Prompter = (p: Prompt) => Promise<unknown>;

// All @clack UI is routed to stderr so it never corrupts stdout JSON (SPEC §8).
const CLACK = { input: process.stdin, output: process.stderr } as const;

function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled.");
    throw new CancelledError();
  }
  return value as T;
}

/** Ask a single manifest prompt interactively via @clack/prompts. */
async function askInteractive(p: Prompt): Promise<unknown> {
  switch (p.type) {
    case "confirm":
      return unwrap(
        await confirm({
          message: p.message,
          initialValue: typeof p.default === "boolean" ? p.default : true,
          ...CLACK,
        }),
      );
    case "text": {
      const dflt = p.default == null ? undefined : String(p.default);
      return unwrap(
        await text({
          message: p.message,
          initialValue: dflt,
          defaultValue: dflt,
          ...CLACK,
        }),
      );
    }
    case "select": {
      const options = (p.choices ?? []).map((c) => ({ value: c, label: c }));
      return unwrap(
        await select({
          message: p.message,
          options,
          initialValue: p.default as string | undefined,
          ...CLACK,
        }),
      );
    }
    case "multiselect": {
      const options = (p.choices ?? []).map((c) => ({ value: c, label: c }));
      return unwrap(
        await multiselect({
          message: p.message,
          options,
          initialValues: Array.isArray(p.default) ? (p.default as string[]) : [],
          required: false,
          ...CLACK,
        }),
      );
    }
  }
}

export const interactivePrompter: Prompter = (p) => askInteractive(p);

/**
 * Non-interactive prompter for `--silent`: answer with the declared default, and
 * fail loudly if a prompt has none (SPEC §8 — silent requires all answers).
 */
export const silentPrompter: Prompter = (p) => {
  if (p.default === undefined) {
    return Promise.reject(
      new Error(
        `--silent: prompt "${p.id}" (${p.message}) has no default; supply it via --answers or flags.`,
      ),
    );
  }
  return Promise.resolve(p.default);
};

export interface GatherOptions {
  silent: boolean;
  prompter: Prompter;
  /** Pre-supplied answers (e.g. from flags/JSON) that take precedence. */
  preset?: Answers;
}

/**
 * Gather answers for a manifest's declared prompts up front. Preset answers win;
 * remaining prompts are asked via the active prompter (interactive or silent).
 */
export async function gatherAnswers(
  prompts: Prompt[] | undefined,
  opts: GatherOptions,
): Promise<Answers> {
  const answers: Answers = { ...(opts.preset ?? {}) };
  for (const p of prompts ?? []) {
    if (Object.prototype.hasOwnProperty.call(answers, p.id)) continue;
    answers[p.id] = await opts.prompter(p);
  }
  return answers;
}
