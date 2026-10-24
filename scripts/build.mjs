/**
 * 用 esbuild 把 Node 入口打成单文件，避免 ESM 扩展名与依赖解析问题。
 */
import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.js",
  packages: "external",
  sourcemap: false,
  logLevel: "info",
});
