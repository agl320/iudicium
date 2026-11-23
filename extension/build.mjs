// Bundles the extension into dist/ (load it via chrome://extensions → Load unpacked),
// plus test bundles in test/.build/.
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
mkdirSync("dist", { recursive: true });
copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("src/options/options.html", "dist/options.html");

const builds = [
  {
    entryPoints: {
      content: "src/ext/content.ts",
      background: "src/ext/background.ts",
      bridge: "src/ext/bridge.ts",
      options: "src/options/options.ts",
    },
    outdir: "dist",
    format: "iife",
    target: "chrome120",
  },
  // Tests: engine + Workday adapter in the page, and the learning core in Node.
  { entryPoints: { harness: "src/harness.ts" }, outdir: "test/.build", format: "iife", target: "chrome120" },
  { entryPoints: { learn: "src/core/learn/api.ts" }, outdir: "test/.build", format: "esm", platform: "node", outExtension: { ".js": ".mjs" } },
];

const contexts = await Promise.all(builds.map((b) => esbuild.context({ bundle: true, logLevel: "info", ...b })));
if (watch) await Promise.all(contexts.map((c) => c.watch()));
else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
}
