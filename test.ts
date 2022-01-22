import { build, initialize } from "./esbuild-wasm/mod.ts";

const res = await fetch(
  "https://cdn.jsdelivr.net/npm/esbuild-wasm@0.14.11/esbuild.wasm",
);
const wasm = await res.arrayBuffer();

initialize({
  wasm,
  workerURL: new URL("./esbuild-wasm/esbuild.worker.ts", import.meta.url),
  type: "module",
});

const { outputFiles } = await build({
  stdin: {
    contents: "console.log('hello, world');",
    loader: "ts",
  },
  minify: true,
});
console.log(outputFiles);
