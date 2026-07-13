import { definePlugin } from "@initup/core";

/**
 * FastAPI — a minimal web API skeleton.
 *
 * Installs `fastapi[standard]`, the officially recommended extra that bundles
 * Uvicorn (the ASGI server) and the `fastapi` CLI, so no separate uvicorn
 * install is needed. `ctx.install` dispatches through the app's detected manager
 * (`uv add`/`poetry add`/`pip install`). Then it writes a starter app with a
 * `GET /` route into the resolved entry file (`main.py`, else `app.py`).
 *
 * Starting the server is left to the developer (`ctx.warn`) so the plugin stays
 * install-only — no exec, no network.
 */
export default definePlugin({
  name: "fastapi",
  displayName: "FastAPI",
  version: "1.0.0",
  appliesTo: { framework: "fastapi" },
  languages: ["python"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "fastapi" },
  prompts: [],
  setup: (ctx) => {
    // `fastapi[standard]` pulls in uvicorn[standard] + the fastapi CLI.
    ctx.install(["fastapi[standard]"]);

    const main = ctx.findOrCreate(["main.py", "app.py"], "main.py");
    ctx.addFile(
      main,
      `from fastapi import FastAPI

app = FastAPI()


@app.get("/")
async def root():
    return {"message": "Hello World"}
`,
    );

    ctx.warn(
      "Run 'uvicorn main:app --reload' to start (or 'fastapi dev main.py').",
    );
  },
});
