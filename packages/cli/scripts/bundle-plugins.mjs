// Copy the first-party plugin folders into the CLI's dist so they ship inside
// the published `initup` package. `defaultPluginsDir()` finds `dist/plugins`
// first (it sits right next to `dist/cli.js`), so `initup add <name>` resolves
// bundled plugins even when installed from npm (where the repo `plugins/` dir
// is not present). node_modules are never copied.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "..", "..", "plugins");
const destRoot = join(here, "..", "dist", "plugins");

rmSync(destRoot, { recursive: true, force: true });
mkdirSync(destRoot, { recursive: true });

let count = 0;
for (const entry of readdirSync(srcRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const from = join(srcRoot, entry.name);
  const to = join(destRoot, entry.name);
  cpSync(from, to, {
    recursive: true,
    filter: (s) => !s.split(sep).includes("node_modules"),
  });
  count++;
}

if (!existsSync(destRoot) || count === 0) {
  console.error("bundle-plugins: no plugins copied");
  process.exit(1);
}
console.log(`bundle-plugins: copied ${count} plugins → dist/plugins`);
