import { defineConfig } from "tsup";

export default defineConfig({
  // Two entries: the `xinit` executable (cli.js) and the library entry
  // (index.js) that re-exports the typed authoring SDK. Node strips a leading
  // shebang from any module it loads, so the banner is harmless on index.js.
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  dts: true,
  banner: { js: "#!/usr/bin/env node" },
});
