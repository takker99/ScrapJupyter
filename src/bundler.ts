import { build, httpFetch, initialize } from "./deps/esbuild-wasm.ts";

let initialized: Promise<void> | undefined;
export async function loadWasm() {
  if (initialized === undefined) {
    initialized = initialize({
      wasmURL: "https://scrapbox.io/files/61231ff40ef655001d6f7109.wasm",
    });
  }
  return await initialized;
}

export type AvailableExtensions =
  | "ts"
  | "js"
  | "tsx"
  | "jsx"
  | "mjs"
  | "javascript"
  | "typescript";
export function isAvailableExtensions(
  extension: string,
): extension is AvailableExtensions {
  return ["ts", "js", "tsx", "jsx", "mjs", "javascript", "typescript"].includes(
    extension,
  );
}

export type BundleOptions = {
  extension: AvailableExtensions;
  fileName?: string;
  resolveDir: string;
};

export async function bundle(
  contents: string,
  { extension, fileName, resolveDir }: BundleOptions,
) {
  await loadWasm();
  const { outputFiles } = await build({
    stdin: {
      contents,
      loader: getLoader(extension),
      resolveDir,
      sourcefile: fileName,
    },
    format: "esm",
    bundle: true,
    minify: true,
    charset: "utf8",
    plugins: [httpFetch],
    write: false,
  });
  return outputFiles[0].text;
}

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
