/// <reference lib="deno.ns"/>
/// <reference lib="deno.unstable"/>

import { Command } from "https://deno.land/x/cliffy@v0.19.2/command/mod.ts";
import { build, stop } from "./deps/esbuild.ts";
import { fromFileUrl, relative } from "./deps/path.ts";
import { exists } from "./deps/fs.ts";
import { toLc } from "./utils.ts";
import { cache } from "https://deno.land/x/esbuild_plugin_cache@v0.2.8/mod.ts";

const { options } = await new Command()
  .name("builder")
  .version("0.1.0")
  .description(
    "Build tool to generate scrapbox json data including bundled scripts",
  )
  .option(
    "-p, --project <project>",
    "The project name of the page which includes bundled scripts",
    { required: true },
  )
  .option(
    "-t, --title <title>",
    "The title of the page which includes bundled scripts",
    { required: true },
  )
  .option("-w, --wasm-url [url]", "The URL of esbuild.wasm", {
    default: "https://scrapbox.io/files/613405865f15ce002394c919.wasm",
  })
  .option("--source-map [boolean:boolean]", "Whether to append source maps", {
    default: false,
  })
  .parse(Deno.args);

const { title, wasmUrl, project, sourceMap } = options;

const url = new URL("./app.ts", import.meta.url);
const input = /https?:\/\//.test(url.href)
  ? ({
    stdin: {
      contents: `import "${url}";`,
      loader: "ts" as const,
      sourcefile: "mod.ts",
    },
  })
  : ({
    entryPoints: [relative(Deno.cwd(), fromFileUrl(url))],
  });
const { outputFiles } = await build({
  ...input,
  bundle: true,
  minify: true,
  format: "esm",
  charset: "utf8",
  write: false,
  define: {
    "WORKER_URL": `"https://scrapbox.io/api/code/${project}/${
      toLc(title)
    }/worker.js"`,
    "WASM_URL": `"${wasmUrl}"`,
  },
  sourcemap: sourceMap ? "inline" : undefined,
  plugins: [cache({ importmap: { imports: {} }, directory: "./cache" })],
});
const mainSrc = outputFiles[0].text;

const workerSrc = await Deno.readTextFile(
  new URL("./esbuild.worker.js", import.meta.url),
);
const { outputFiles: [{ text: workerBundledSrc }] } = await build({
  stdin: {
    contents: workerSrc,
    loader: "js",
    sourcefile: "worker.js",
  },
  minify: true,
  format: "iife",
  charset: "utf8",
  write: false,
  sourcemap: sourceMap ? "inline" : undefined,
});
stop();

const json = {
  pages: [{
    title,
    lines: [
      title,
      "@takker/ScrapJupyterのbundle済みソースコード",
      ` [/emoji/warning.icon]このページは[build.ts ${import.meta.url}]によって自動生成されたページです`,
      "",
      "使い方",
      " 自分のページの`script.js`に以下を追記して下さい",
      " code:js",
      `  import "../${toLc(title)}/mod.js";`,
      "",
      "source codes",
      "code:mod.js",
      ...mainSrc.split("\n").map((line) => ` ${line}`),
      "",
      "code:worker.js",
      ...workerBundledSrc.split("\n").map((line) => ` ${line}`),
    ],
  }],
};
console.log(JSON.stringify(json));
if (await exists("./cache")) await Deno.remove("./cache", { recursive: true });
