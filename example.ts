import { build, initialize } from "./deps/esbuild-wasm.ts";
import { remoteLoader, RobustFetch } from "./remoteLoader.ts";
import { createErr, createOk } from "./deps/option-t.ts";
import { resolver } from "./deps/esbuild_deno_loader.ts";
import { ImportGraph, viewGraph } from "./viewGraph.ts";

await initialize({
  // 0.21.4
  wasmModule: await WebAssembly.compileStreaming(
    globalThis.fetch(
      "https://cdn.jsdelivr.net/npm/esbuild-wasm@0.21.5/esbuild.wasm",
    ),
  ),
  workerURL: new URL(
    "https://raw.githubusercontent.com/takker99/esbuild-wasm-no-blob/0.21.5/worker.ts",
    import.meta.url,
  ),
});

const fetchCORS: RobustFetch = async (req, _) => {
  try {
    const res = await fetch(req);
    return res.ok ? createOk([res, false]) : createErr({
      name: "HTTPError",
      message: `${res.status} ${res.statusText}`,
      response: res,
    });
  } catch (e: unknown) {
    if (e instanceof TypeError) {
      return createErr({
        name: "NetworkError",
        message: e.message,
        request: req,
      });
    }
    if (e instanceof DOMException) {
      return createErr({
        name: "AbortError",
        message: e.message,
        request: req,
      });
    }
    throw e;
  }
};

const entryPoints = [
  "https://scrapbox.io/api/code/takker/for-any-project/script.ts",
  "https://scrapbox.io/api/code/shokai/shokai/script.js",
  "https://scrapbox.io/api/code/nishio/nishio/script.js",
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
    remoteLoader({
      fetch: fetchCORS,
      reload: [new URLPattern({ hostname: "scrapbox.io" })],
    }),
  ],
  write: false,
});

const graphMap = new Map<string, ImportGraph>();
for (const [path, { imports }] of Object.entries(result.metafile.inputs)) {
  graphMap.set(path, {
    isCache: false,
    children: imports.flatMap((imp) =>
      imp.external ? [] : [new URL(imp.path).href]
    ),
  });
}
for (const entryPoint of entryPoints) {
  console.debug(viewGraph(entryPoint, graphMap));
}

// // 2つのファイルが配列される
// for (const text of result.outputFiles.map((f) => f.text)) {
//   console.debug(text);
// }
