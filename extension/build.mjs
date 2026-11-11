// Bundles the extension into dist/ (load it via chrome://extensions → Load unpacked).
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
mkdirSync("dist", { recursive: true });
copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("src/options/options.html", "dist/options.html");

const ctx = await esbuild.context({
  entryPoints: {
    content: "src/ext/content.ts",
    background: "src/ext/background.ts",
    options: "src/options/options.ts",
    harness: "src/harness.ts", // tests only
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
});
if (watch) await ctx.watch();
else {
  await ctx.rebuild();
  await ctx.dispose();
}
