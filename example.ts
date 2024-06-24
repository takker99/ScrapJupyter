import { build, initialize } from "./deps/esbuild-wasm.ts";
import { remoteLoader } from "./remoteLoader.ts";
import { makeGraph, viewGraph } from "./viewGraph.ts";
import { Graph, ImportGraph } from "./bundler.ts";

await initialize({
  // 0.21.4
  wasmModule: await WebAssembly.compileStreaming(
    fetch("https://cdn.jsdelivr.net/npm/esbuild-wasm@0.21.5/esbuild.wasm"),
  ),
  workerURL: new URL(
    "https://raw.githubusercontent.com/takker99/esbuild-wasm-no-blob/0.21.5/worker.ts",
    import.meta.url,
  ),
});

const fetchCORS = async (
  req: Request,
  _: boolean,
): Promise<[Response, boolean]> => {
  const res = await fetch(req);
  if (res.ok) return [res, false];
  throw new TypeError(`${res.status} ${res.statusText}`);
};

const graphMap = new Map<string, ImportGraph>();
const entryPoints = [
  "https://scrapbox.io/api/code/takker/for-any-project/script.ts",
  "https://scrapbox.io/api/code/shokai/shokai/script.js",
  "https://scrapbox.io/api/code/nishio/nishio/script.js",
];

// deno-lint-ignore no-unused-vars
const result = await build({
  entryPoints,
  format: "esm",
  minify: true,
  bundle: true,
  outdir: "out", // https://scrapbox.io/api/code が /out に置換される
  charset: "utf8",
  plugins: [remoteLoader({
    fetch: fetchCORS,
    importMapURL: new URL(
      "https://scrapbox.io/api/code/takker/for-any-project/import_map.json",
    ),
    progressCallback: (message) => {
      if (message.type === "resolve") {
        if (!message.parent) return;

        const parent: ImportGraph = graphMap.get(message.parent) ?? {
          path: message.parent,
          isCache: false,
          children: [],
        };
        const child: ImportGraph = graphMap.get(message.path) ?? {
          path: message.path,
          isCache: false,
          children: [],
        };
        parent.children.push(child);
        graphMap.set(message.parent, parent);
        graphMap.set(message.path, child);
        return;
      }
      message.done.then(({ isCache }) => {
        const graph = graphMap.get(message.path) ?? {
          path: message.path,
          isCache,
          children: [],
        };
        graph.isCache = isCache;
        graphMap.set(message.path, graph);
      });
    },
  })],
  write: false,
});

for (const entryPoint of entryPoints) {
  console.log(viewGraph(graphMap.get(entryPoint)!));
}

// // 2つのファイルが配列される
// for (const text of result.outputFiles.map((f) => f.text)) {
//   console.debug(text);
// }
