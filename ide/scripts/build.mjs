import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// Build the extension
const ctx = await esbuild.build({
  entryPoints: [path.join(rootDir, "src", "extension.ts")],
  bundle: true,
  outfile: path.join(rootDir, "dist", "extension.js"),
  external: ["vscode"],
  platform: "node",
  target: "es2020",
  sourcemap: true,
  minify: process.env.NODE_ENV === "production",
});

console.log("✅ Extension build complete");