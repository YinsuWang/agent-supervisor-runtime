import { build } from "esbuild";

await build({
  entryPoints: {
    "service-worker": "extension/src/service-worker.ts",
    "content-script": "extension/src/content-script.ts",
    popup: "extension/src/popup.ts",
  },
  outdir: "extension/dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: false,
  minify: false,
  logLevel: "info",
});
