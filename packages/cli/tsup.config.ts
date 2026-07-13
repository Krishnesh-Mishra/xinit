import { defineConfig } from "tsup";

export default defineConfig({
  // Two entries: the `initup` executable (cli.js) and the library entry
  // (index.js) that re-exports the typed authoring SDK. Node strips a leading
  // shebang from any module it loads, so the banner is harmless on index.js.
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  // Inline @initup/core's types into the emitted .d.ts so the published package
  // has no dangling '@initup/core' type import for TS consumers.
  dts: { resolve: ["@initup/core"] },
  banner: { js: "#!/usr/bin/env node" },
  // Publish a single self-contained `initup` package: bundle the workspace
  // engine (@initup/core) into the output so there is no @initup/* dependency.
  // Third-party npm deps stay external (declared in package.json).
  noExternal: ["@initup/core"],
});
