import { Loader } from "./deps/esbuild-wasm.ts";

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

export const extensionToLoader = (extension: AvailableExtensions): Loader => {
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
};
