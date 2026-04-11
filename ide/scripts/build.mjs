import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const isWatch = process.argv.includes("--watch");

const options = {
  entryPoints: [path.join(rootDir, "src", "extension.ts")],
  bundle: true,
  outfile: path.join(rootDir, "dist", "extension.js"),
  external: ["vscode"],
  platform: "node",
  target: "es2020",
  sourcemap: true,
  minify: process.env.NODE_ENV === "production",
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("👀 Watching for changes...");
} else {
  await esbuild.build(options);
  console.log("✅ Extension build complete");
}