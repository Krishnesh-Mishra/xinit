import * as fsp from "node:fs/promises";
import * as path from "node:path";

import { pack } from "@xinit/core";

import { IO } from "../lib/io.js";

export interface MakeFlags {
  out?: string;
  json?: boolean;
}

export interface MakeDeps {
  io?: IO;
  cwd?: string;
}

export interface MakeResult {
  status: "success";
  name: string;
  out: string;
}

/**
 * `xinit make <entry>` — compile a typed plugin authoring file (`plugin.ts`) or
 * a plugin folder into the packed, pasteable distributable JSON. A superset of
 * `pack`: `<entry>` may be a `.ts` file OR a directory.
 */
export async function runMake(
  entry: string,
  flags: MakeFlags,
  deps: MakeDeps = {},
): Promise<MakeResult> {
  const io = deps.io ?? new IO({ json: flags.json });
  const cwd = deps.cwd ?? process.cwd();

  const manifest = await pack(path.resolve(cwd, entry));
  const out = flags.out
    ? path.resolve(cwd, flags.out)
    : path.resolve(cwd, `${manifest.name}.json`);

  await fsp.mkdir(path.dirname(out), { recursive: true });
  await fsp.writeFile(out, JSON.stringify(manifest, null, 2) + "\n");

  const result: MakeResult = { status: "success", name: manifest.name, out };
  if (io.json) {
    io.result(result);
  } else {
    io.note(io.c.green(`Made ${io.c.bold(manifest.name)} → ${out}`));
  }
  return result;
}
