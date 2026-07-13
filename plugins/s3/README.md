# s3

Adds an AWS S3 client to a backend — **cross-language**. The plugin branches on
the app's language (`ctx.language()`) and installs the idiomatic AWS SDK for each
stack.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup pack plugins/s3`.

- **Applies to:** any backend, `ts` / `js` / `python` (no `appliesTo`).
- Add-to-existing modifier.

## What it installs / patches

| Language  | Installs               | File          | Client                        |
| --------- | ---------------------- | ------------- | ----------------------------- |
| `python`  | `boto3`                | `s3.py`       | `boto3.client("s3")`          |
| `ts`      | `@aws-sdk/client-s3`   | `src/s3.ts`   | shared `S3Client` (SDK v3)    |
| `js`      | `@aws-sdk/client-s3`   | `src/s3.js`   | shared `S3Client` (SDK v3)    |

`ctx.install` dispatches through the app's detected package manager — `uv add`
for a Python/uv app, `pnpm add`/`npm install`/… for a JS app — so the plugin only
picks package **names** per language, never the manager.

- **`.env`:** ensures `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  and `S3_BUCKET` (seeded into `.env.example` too; existing values are never
  overwritten).
- Warns to set the AWS credentials before making requests.

Capabilities: `install` only — no exec, no network.
