import { analyzeMetafile, build, initialize } from "./deps/esbuild-wasm.ts";
import { remoteLoader } from "./remoteLoader.ts";
import { resolver } from "./deps/esbuild_deno_loader.ts";

await initialize({
  // 0.24.0
  wasm: await WebAssembly.compileStreaming(
    globalThis.fetch(
      "https://cdn.jsdelivr.net/npm/esbuild-wasm@0.24.0/esbuild.wasm",
    ),
  ),
  worker: new URL(
    "jsr:@takker/esbuild-wasm-no-blob@0.24.0/worker",
    import.meta.url,
  ),
});

const entryPoints = [
  "https://scrapbox.io/api/code/shokai/shokai/script.js",
  "https://jsr.io/@luca/esbuild-deno-loader/0.10.3/mod.ts",
  "jsr:@core/match@0.3.1",
  "npm:glslCanvas@0",
  "npm:@progfay/scrapbox-parser",
  // not supported yet because this package includes node.js built-in modules
  //"jsr:@deno/dnt@^0.41.1",
];

const result = await build({
  entryPoints,
  format: "esm",
  minify: true,
  bundle: true,
  outdir: "out", // https://scrapbox.io/api/code が /out に置換される
  charset: "utf8",
  metafile: true,
  plugins: [
    resolver({
      importMapURL:
        "https://scrapbox.io/api/code/takker/for-any-project/import_map.json",
    }),
    remoteLoader({ reload: [new URLPattern({ hostname: "scrapbox.io" })] }),
  ],
  write: false,
});

console.log(
  await analyzeMetafile(result.metafile, { color: true, verbose: true }),
);

// for (const text of result.outputFiles.map((f) => f.text)) {
//   console.debug(text);
// }

close();
