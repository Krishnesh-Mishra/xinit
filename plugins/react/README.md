# react

Scaffolds a React app on Vite. Base plugin for `new-app` projects.

## Prompts

| id        | type    | default | effect                                              |
| --------- | ------- | ------- | --------------------------------------------------- |
| `ts`      | confirm | `true`  | TypeScript (`.tsx`) vs JavaScript (`.jsx`) sources. |
| `tailwind`| confirm | `true`  | Add Tailwind CSS v4 via `@tailwindcss/vite`.        |
| `router`  | confirm | `false` | Add `react-router-dom` + a `routes` module.         |
| `vitest`  | confirm | `false` | Add Vitest + Testing Library and a `test` script.   |

## What it installs / patches

- **Installs:** `react`, `react-dom`. **Dev:** `vite`, `@vitejs/plugin-react`
  (+ `typescript`/`@types/*` when `ts`).
- **Files:** `index.html`, `src/main.{tsx,jsx}`, `src/App.{tsx,jsx}`,
  `src/index.css`, `vite.config.{ts,js}` (+ `tsconfig.json` when `ts`).
- **Scripts:** `dev`, `build`, `preview` (+ `test` when `vitest`).
- **Tailwind:** patches the Vite config to register `tailwindcss()` and prepends
  `@import "tailwindcss";` to `src/index.css`.
- **Router:** copies `src/routes.{tsx,jsx}` and ensures its import in `main`.

Capabilities: `install` only — no exec, no network.
