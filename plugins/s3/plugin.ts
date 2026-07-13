import { definePlugin } from "@initup/core";

/**
 * AWS S3 client — cross-language (JS/TS + Python).
 *
 * Branches on `ctx.language()`:
 * - **python** → installs `boto3` and drops `s3.py`, a configured `boto3` S3
 *   client reading `AWS_REGION` from the environment.
 * - **ts/js** → installs `@aws-sdk/client-s3` (AWS SDK for JavaScript v3) and
 *   drops `src/s3.{ts,js}`, a shared `S3Client`.
 *
 * `ctx.install` auto-dispatches through the app's detected manager (`uv add` for
 * Python, `pnpm add`/… for JS), so the plugin only branches package NAMES and
 * file contents — never the manager.
 *
 * install-only — no exec, no network.
 */
export default definePlugin({
  name: "s3",
  displayName: "AWS S3",
  version: "1.0.0",
  languages: ["ts", "js", "python"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: true, exec: false, network: false },
  detect: { dependency: "@aws-sdk/client-s3" },
  prompts: [],
  setup: (ctx) => {
    const lang = ctx.language();

    if (lang === "python") {
      ctx.install(["boto3"]);
      ctx.addFile(
        "s3.py",
        `import os

import boto3

# Credentials are read from the standard AWS env vars / config chain.
s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))

S3_BUCKET = os.environ.get("S3_BUCKET", "my-bucket")
`,
      );
    } else {
      const ext = lang === "ts" ? "ts" : "js";
      ctx.install(["@aws-sdk/client-s3"]);
      ctx.addFile(
        `src/s3.${ext}`,
        `import { S3Client } from "@aws-sdk/client-s3";

// Credentials are resolved from the standard AWS provider chain (env vars,
// shared config, or IAM role) when AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
// are set in the environment.
export const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export const S3_BUCKET = process.env.S3_BUCKET ?? "my-bucket";

export default s3;
`,
      );
    }

    // Env-aware upserts — none overwrite an existing value; all seed .env.example.
    ctx.setEnv("AWS_REGION", "us-east-1", { example: true });
    ctx.setEnv("AWS_ACCESS_KEY_ID", "", { example: true });
    ctx.setEnv("AWS_SECRET_ACCESS_KEY", "", { example: true });
    ctx.setEnv("S3_BUCKET", "my-bucket", { example: true });

    ctx.warn(
      "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env (or use an IAM role) before making S3 requests.",
    );
  },
});
