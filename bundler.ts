import { build, initialize } from "./deps/esbuild-wasm.ts";
import { remoteLoader } from "./plugin.ts";

type Builder = (contents: string, options: BundleOptions) => Promise<string>;

let initialized: Promise<void> | undefined;
/** esbuildを読み込み、builderを返す */
export const load = async (
  wasm: WebAssembly.Module,
  workerURL: string | URL,
): Promise<Builder> => {
  initialized ??= initialize({
    wasmModule: wasm,
    workerURL,
  });
  await initialized;

  return async (
    contents,
    { extension, fileName, dirURL },
  ) => {
    fileName ??= `codeblock-${
      Math.floor(0xFFFFFE * Math.random()).toString(16)
    }.${getLoader(extension)}`;
    const baseURL = `${dirURL}${fileName}`;

    const { outputFiles } = await build({
      stdin: {
        contents: `import "${baseURL}";`,
        loader: getLoader(extension),
      },
      format: "esm",
      bundle: true,
      minify: true,
      charset: "utf8",
      plugins: [
        remoteLoader({
          baseURL: new URL(baseURL),
          sources: [{
            path: baseURL,
            contents,
            loader: getLoader(extension),
          }],
        }),
      ],
      write: false,
    });
    return outputFiles[0].text;
  };
};

export type AvailableExtensions =
  | "ts"
  | "js"
  | "tsx"
  | "jsx"
  | "mjs"
  | "javascript"
  | "typescript";
export const isAvailableExtensions = (
  extension: string,
): extension is AvailableExtensions =>
  ["ts", "js", "tsx", "jsx", "mjs", "javascript", "typescript"].includes(
    extension,
  );

export type BundleOptions = {
  extension: AvailableExtensions;
  fileName?: string;
  dirURL: string;
};

function getLoader(extension: AvailableExtensions) {
  switch (extension) {
    case "javascript":
    case "js":
    case "mjs":
      return "js" as const;
    case "typescript":
    case "ts":
      return "ts" as const;
    case "jsx":
      return "jsx" as const;
    case "tsx":
      return "tsx" as const;
  }
}
