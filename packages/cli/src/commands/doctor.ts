import type { Project } from "@initup/core";

import { IO } from "../lib/io.js";
import { runDetect } from "./detect.js";

export interface DoctorFlags {
  json?: boolean;
}

export interface DoctorDeps {
  io?: IO;
  cwd?: string;
}

interface DoctorIssue {
  scope: string;
  level: "warn";
  message: string;
}

export interface DoctorReport {
  root: string;
  kind: Project["kind"];
  manager: string;
  confidence: number;
  apps: { name: string; path: string; framework?: string; plugins: string[] }[];
  issues: DoctorIssue[];
}

/** Build a modest health report (reports only — v1 doctor never fixes; SPEC §8). */
export function buildReport(project: Project): DoctorReport {
  const issues: DoctorIssue[] = [];

  if (project.confidence < 0.6) {
    issues.push({
      scope: "(project)",
      level: "warn",
      message: `low detection confidence (${project.confidence.toFixed(2)}) — confirm the layout`,
    });
  }
  if (project.manager === "unknown") {
    issues.push({ scope: "(project)", level: "warn", message: "package manager not identified" });
  }
  for (const app of project.apps) {
    if (!app.framework) {
      issues.push({ scope: app.name, level: "warn", message: "unknown framework" });
    }
  }

  return {
    root: project.root,
    kind: project.kind,
    manager: project.manager,
    confidence: project.confidence,
    apps: project.apps.map((a) => ({
      name: a.name,
      path: a.path,
      framework: a.framework,
      plugins: a.plugins,
    })),
    issues,
  };
}

export async function runDoctor(
  cwd: string,
  flags: DoctorFlags,
  deps: DoctorDeps = {},
): Promise<DoctorReport> {
  const io = deps.io ?? new IO({ json: flags.json });
  const project = await runDetect(deps.cwd ?? cwd);
  const report = buildReport(project);

  if (io.json) {
    io.result(report);
    return report;
  }

  const c = io.c;
  io.note(`${c.bold("initup doctor")}  ${c.dim(report.root)}`);
  io.note(`  ${report.kind}, ${report.manager}, confidence ${report.confidence.toFixed(2)}`);
  io.note("");
  for (const a of report.apps) {
    const fw = a.framework ? c.cyan(a.framework) : c.yellow("unknown");
    io.note(`  ${c.green("•")} ${a.name} ${c.dim(a.path)} [${fw}]`);
    if (a.plugins.length) io.note(`      detected plugins: ${a.plugins.join(", ")}`);
  }
  io.note("");
  if (report.issues.length === 0) {
    io.note(c.green("No issues detected."));
  } else {
    io.note(c.bold(`${report.issues.length} issue(s):`));
    for (const issue of report.issues) {
      io.note(`  ${c.yellow("!")} ${issue.scope}: ${issue.message}`);
    }
  }
  return report;
}
