import { Loader } from "./deps/esbuild-wasm.ts";

const loaderList: Loader[] = [
  "base64",
  "binary",
  "copy",
  "css",
  "dataurl",
  "default",
  "empty",
  "file",
  "js",
  "json",
  "jsx",
  "local-css",
  "text",
  "ts",
  "tsx",
];
const isLoader = (loader: string): loader is Loader =>
  (loaderList as string[]).includes(loader);

export const responseToLoader = (response: Response): Loader => {
  const url = response.url;
  const ext = url.split(".").pop();
  if (ext && isLoader(ext)) return ext;
  if (ext === "mjs") return "js";
  const contentType = response.headers.get("Content-Type") ?? "text/plain";
  const mimeType = contentType.split(";")[0]?.trim?.() ?? "text/plain";
  return mimeTypeToLoader(mimeType);
};

export const mimeTypeToLoader = (mimeType: string): Loader => {
  const subType = mimeType.split("/")[1] ?? "plain";
  if (/(?:^plain$|^xml|^svg|^x?html)/.test(subType)) {
    return "text";
  }
  if (subType.startsWith("json")) {
    return "json";
  }
  switch (subType) {
    case "javascript":
      return "js";
    case "typescript":
      return "ts";
    case "css":
      return "css";
    default:
      return "text";
  }
};
