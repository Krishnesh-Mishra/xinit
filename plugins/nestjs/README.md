# nestjs

Scaffolds a full [NestJS](https://nestjs.com) backend by delegating to the
official `@nestjs/cli`. Applies to `node-backend` projects.

> Authored as a single typed `plugin.ts` (`export default definePlugin({ …facts, setup })`).
> Compile it to a distributable JSON with `initup pack plugins/nestjs`.

## Prompts

| id              | type   | default  | effect                                            |
| --------------- | ------ | -------- | ------------------------------------------------- |
| `packageManager`| select | `"pnpm"` | Passed to `--package-manager` so the CLI installs deps without prompting. |

## What it does

Runs the Nest CLI to generate the project in the current directory:

```
npx @nestjs/cli new . --skip-git --strict --package-manager <pm>
```

This creates `src/` (with `main.ts`, `app.module.ts`, `app.controller.ts`,
`app.service.ts`), `test/`, `tsconfig.json`, `nest-cli.json`, `package.json`
and installs all dependencies.

Capabilities: `install`, `exec`, and `network` — the CLI runs a subprocess and
downloads packages. Under third-party trust this requires a consent handshake
(SPEC §8) before it runs.
