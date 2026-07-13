import { detect } from "@initup/core";
import type { Project } from "@initup/core";

import { IO } from "../lib/io.js";

/** Thin, unit-testable core call: fingerprint the project at `cwd`. */
export function runDetect(cwd: string): Promise<Project> {
  return detect(cwd);
}

/** Render a Project as a human-readable tree to the IO's human stream. */
export function renderProject(project: Project, io: IO): void {
  const c = io.c;
  const low = project.confidence < 0.6;

  io.note(
    `${c.bold(project.root)}  ${c.dim(`(${project.kind}, ${project.manager})`)}`,
  );
  io.note(
    `confidence: ${low ? c.yellow(project.confidence.toFixed(2)) : c.green(project.confidence.toFixed(2))}` +
      (low ? c.yellow("  — low; please confirm the detected layout") : ""),
  );

  const section = (title: string, apps: Project["apps"]): void => {
    if (apps.length === 0) return;
    io.note("");
    io.note(c.bold(title));
    for (const a of apps) {
      const fw = a.framework ? c.cyan(a.framework) : c.dim("unknown framework");
      io.note(`  ${c.green("•")} ${a.name} ${c.dim(a.path)}  [${a.language}, ${fw}]`);
      if (a.plugins.length > 0) {
        io.note(`      plugins: ${a.plugins.map((p) => c.magenta(p)).join(", ")}`);
      }
    }
  };

  section("Apps", project.apps);
  section("Packages", project.packages);
}

export interface DetectFlags {
  json?: boolean;
}

/** Command handler for `initup detect`. */
export async function detectCommand(cwd: string, flags: DetectFlags): Promise<void> {
  const io = new IO({ json: flags.json });
  const project = await runDetect(cwd);
  if (io.json) {
    io.result(project);
    return;
  }
  renderProject(project, io);
}
