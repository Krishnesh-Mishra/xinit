import type { Ctx, Answers } from "@xinit/core";

/**
 * Express + TypeScript (tsx) backend.
 *
 * The `port` answer is a text value; it is interpolated into the generated
 * `src/server.ts` via `ctx.addFile` (computation is free — only the write is
 * recorded into the Plan).
 */
export default async function setup(ctx: Ctx, answers: Answers): Promise<void> {
  const port =
    typeof answers.port === "string" && answers.port.trim() !== ""
      ? answers.port.trim()
      : "3000";

  ctx.install(["express"]);
  ctx.installDev(["@types/express", "tsx", "typescript"]);

  ctx.copy("files/tsconfig.json", "tsconfig.json");

  ctx.addFile(
    "src/server.ts",
    `import express from "express";

const app = express();
const PORT = Number(process.env.PORT ?? ${port});

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(\`Server listening on http://localhost:\${PORT}\`);
});

export default app;
`,
  );

  ctx.setScript("dev", "tsx watch src/server.ts");
  ctx.setScript("start", "node --import tsx src/server.ts");
}
