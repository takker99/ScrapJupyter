import { gray } from "https://deno.land/std@0.224.0/fmt/colors.ts";
import { build, initialize } from "./deps/esbuild-wasm.ts";
import { remoteLoader } from "./remoteLoader.ts";
import { relative as makeRelative } from "https://raw.githubusercontent.com/takker99/scrapbox-bundler/632c749a6287d628bb8bed5cf21c5d9b6f15f58e/path.ts";

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

/** keyが親ファイルパス, valueがそのファイルでimportしたファイルのパスリスト */
const ancestors = new Map<string, string[]>();
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
      if (message.type !== "resolve") return;
      if (!message.parent) return;

      ancestors.set(message.parent, [
        ...(ancestors.get(message.parent) ?? []),
        message.path,
      ]);
    },
  })],
  write: false,
});

function* makeTree(
  parent: string,
  relative?: boolean,
  viewedPath?: Set<string>,
): Generator<string> {
  const childs = ancestors.get(parent);
  if (!childs) return;
  viewedPath ??= new Set<string>();
  viewedPath.add(parent);
  for (let i = 0; i < childs.length; i++) {
    const child = childs[i];
    const relativePath = decodeURIComponent(
      relative ? makeRelative(new URL(parent), new URL(child)) : child,
    );
    const lastOne = i + 1 === childs.length;
    const branch = lastOne ? "└─ " : "├─ ";
    // 一度読み込んだものは灰色で表示する
    if (viewedPath.has(child)) {
      yield `${branch}${gray(relativePath)}`;
      continue;
    }
    yield `${branch}${relativePath}`;
    viewedPath.add(child);
    const indent = lastOne ? "   " : "│  ";
    for (const line of makeTree(child, relative ?? false, viewedPath)) {
      yield `${indent}${line}`;
    }
  }
}

for (const entryPoint of entryPoints) {
  console.log([entryPoint, ...makeTree(entryPoint, true)].join("\n"));
}

// // 2つのファイルが配列される
// for (const text of result.outputFiles.map((f) => f.text)) {
//   console.debug(text);
// }
