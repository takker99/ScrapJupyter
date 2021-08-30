import { build, stop } from "./src/deps/esbuild.ts";
import { ensureDir } from "./src/deps/fs.ts";

const { files } = await Deno.emit("./src/app.ts", {
  bundle: "module",
});
const { outputFiles } = await build({
  stdin: {
    contents: files["deno:///bundle.js"],
    loader: "js",
  },
  minify: true,
  format: "esm",
  charset: "utf8",
  write: false,
});
stop();

await ensureDir("./dist");
await Deno.writeTextFile(
  "./dist/index.min.js",
  "// deno-fmt-ignore-file\n// deno-lint-ignore-file\n" +
    outputFiles[0].text,
);
