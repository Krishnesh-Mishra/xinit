import type { Ctx, Answers } from "@xinit/core";

/**
 * React (Vite) base scaffold.
 *
 * Options are linear `if` branches on the collected answers — never a JSON DSL
 * (SPEC §4). Every effect goes through `ctx`; setup never touches fs directly.
 */
export default async function setup(ctx: Ctx, answers: Answers): Promise<void> {
  // Confirm defaults: ts/tailwind default true, router/vitest default false.
  const ts = answers.ts !== false;
  const tailwind = answers.tailwind !== false;
  const router = answers.router === true;
  const vitest = answers.vitest === true;

  const ext = ts ? "tsx" : "jsx";
  const configExt = ts ? "ts" : "js";
  const viteConfig = `vite.config.${configExt}`;

  // --- Base scaffold -------------------------------------------------------
  ctx.copy(`files/index.${ext}.html`, "index.html");
  ctx.copy(`files/main.${ext}`, `src/main.${ext}`);
  ctx.copy(`files/App.${ext}`, `src/App.${ext}`);
  ctx.copy("files/index.css", "src/index.css");
  ctx.copy(`files/vite.config.${configExt}`, viteConfig);

  ctx.install(["react", "react-dom"]);
  ctx.installDev(["vite", "@vitejs/plugin-react"]);

  ctx.setScript("dev", "vite");
  ctx.setScript("build", ts ? "tsc --noEmit && vite build" : "vite build");
  ctx.setScript("preview", "vite preview");

  // --- TypeScript ----------------------------------------------------------
  if (ts) {
    ctx.installDev(["typescript", "@types/react", "@types/react-dom"]);
    ctx.copy("files/tsconfig.json", "tsconfig.json");
  }

  // --- Tailwind CSS v4 -----------------------------------------------------
  if (tailwind) {
    ctx.installDev(["tailwindcss", "@tailwindcss/vite"]);
    ctx.patchConfig(viteConfig, {
      ensureImport: { tailwindcss: "@tailwindcss/vite" },
      addToArray: { path: "plugins", value: "tailwindcss()" },
    });
    ctx.ensureLine("src/index.css", '@import "tailwindcss";', { position: "top" });
  }

  // --- React Router --------------------------------------------------------
  if (router) {
    ctx.install(["react-router-dom"]);
    ctx.copy(`files/routes.${ext}`, `src/routes.${ext}`);
    ctx.ensureImport(`src/main.${ext}`, {
      import: `import { router } from "./routes";`,
    });
  }

  // --- Vitest --------------------------------------------------------------
  if (vitest) {
    ctx.installDev([
      "vitest",
      "@testing-library/react",
      "@testing-library/jest-dom",
      "jsdom",
    ]);
    ctx.setScript("test", "vitest");
  }
}
