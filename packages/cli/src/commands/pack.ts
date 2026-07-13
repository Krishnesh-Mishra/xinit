import * as fsp from "node:fs/promises";
import * as path from "node:path";

import { pack } from "@initup/core";

import { IO } from "../lib/io.js";

export interface PackFlags {
  out?: string;
  json?: boolean;
}

export interface PackDeps {
  io?: IO;
  cwd?: string;
}

export interface PackResult {
  status: "success";
  name: string;
  out: string;
}

/** `initup pack <dir>` — author folder → single distributable JSON. */
export async function runPack(
  dir: string,
  flags: PackFlags,
  deps: PackDeps = {},
): Promise<PackResult> {
  const io = deps.io ?? new IO({ json: flags.json });
  const cwd = deps.cwd ?? process.cwd();

  const manifest = await pack(path.resolve(cwd, dir));
  const out = flags.out
    ? path.resolve(cwd, flags.out)
    : path.resolve(cwd, `${manifest.name}.json`);

  await fsp.writeFile(out, JSON.stringify(manifest, null, 2) + "\n");

  const result: PackResult = { status: "success", name: manifest.name, out };
  if (io.json) {
    io.result(result);
  } else {
    io.note(io.c.green(`Packed ${io.c.bold(manifest.name)} → ${out}`));
  }
  return result;
}
