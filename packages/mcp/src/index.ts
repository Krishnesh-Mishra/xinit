/**
 * XInit MCP server (M5, SPEC §8).
 *
 * A stdio MCP server named "xinit" that exposes `@xinit/core` to AI agents
 * (Claude Code, Codex, Cursor). Every tool is a thin wrapper that calls a
 * handler in `./tools.js` and returns structured JSON in the MCP `content`
 * result; all determinism/idempotency/consent logic stays in core.
 *
 * SDK: @modelcontextprotocol/sdk ^1.29 — `McpServer.registerTool(name, config,
 * cb)` with zod-raw-shape `inputSchema`, over `StdioServerTransport`.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  addPluginTool,
  detectTool,
  doctorTool,
  getGraphTool,
  listPluginsTool,
  searchPluginsTool,
  type ToolDeps,
} from "./tools.js";

/** Wrap a handler result as an MCP text-content payload. */
function ok(result: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ],
  };
}

/** Run a handler, converting any throw into an MCP tool error (never crash). */
async function run(fn: () => unknown | Promise<unknown>) {
  try {
    return ok(await fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Register every XInit tool on `server`. `deps` is injectable so an embedding
 * host (or a test) can supply a plugins dir / installer / runner.
 */
export function registerTools(server: McpServer, deps: ToolDeps = {}): void {
  server.registerTool(
    "detect_project",
    {
      title: "Detect project",
      description:
        "Fingerprint a project directory and return its XInit Project model " +
        "(kind, manager, apps, packages, detected plugins). Defaults to the " +
        "current working directory.",
      inputSchema: { root: z.string().optional() },
    },
    (args) => run(() => detectTool(args)),
  );

  server.registerTool(
    "list_plugins",
    {
      title: "List plugins",
      description:
        "List the bundled reference plugins (name, displayName, appliesTo, " +
        "capabilities).",
      inputSchema: {},
    },
    () => run(() => listPluginsTool({}, deps)),
  );

  server.registerTool(
    "search_plugins",
    {
      title: "Search plugins",
      description:
        "Filter the bundled reference plugins by name or display name.",
      inputSchema: { query: z.string() },
    },
    (args) => run(() => searchPluginsTool(args, deps)),
  );

  server.registerTool(
    "add_plugin",
    {
      title: "Add plugin",
      description:
        "Add a plugin to an app. `plugin` is a bundled name (first-party) or a " +
        "path to an authored plugin folder (third-party). A third-party plugin " +
        "that needs exec/network returns { status: 'confirmation_required', " +
        "plan, confirmToken } and runs nothing; re-call with the same args plus " +
        "confirm: <token> to proceed. First-party and install-only plugins run " +
        "immediately.",
      inputSchema: {
        plugin: z.string(),
        app: z.string().optional(),
        answers: z.record(z.string(), z.unknown()).optional(),
        confirm: z.string().optional(),
      },
    },
    (args) => run(() => addPluginTool(args, deps)),
  );

  server.registerTool(
    "doctor",
    {
      title: "Doctor",
      description:
        "Detect the project and return a structured health report (apps, " +
        "detected plugins, warnings). Does not modify anything.",
      inputSchema: { root: z.string().optional() },
    },
    (args) => run(() => doctorTool(args)),
  );

  server.registerTool(
    "get_graph",
    {
      title: "Get dependency graph",
      description:
        "Return a dependency-graph-shaped view of the project: nodes for the " +
        "repo, apps/packages, frameworks and plugins, with edges between them.",
      inputSchema: { root: z.string().optional() },
    },
    (args) => run(() => getGraphTool(args)),
  );
}

/** Boot the stdio server. Kept side-effect-free on import for testability. */
export async function main(): Promise<void> {
  const server = new McpServer({ name: "xinit", version: "1.0.0" });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Never write to stdout here — it carries the JSON-RPC stream.
  process.stderr.write("xinit MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(
    `xinit-mcp fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
