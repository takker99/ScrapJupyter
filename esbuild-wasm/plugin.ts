import { Loader, Plugin } from "./types.ts";
import { extname } from "../deps/path.ts";
import { extension } from "../deps/media_types.ts";

const httpFetchNamespace = "http-fetch";
export const httpFetch: Plugin = {
  name: httpFetchNamespace,
  setup({ onResolve, onLoad, initialOptions }) {
    onResolve(
      { filter: /^https?:\/\// },
      ({ path }) => ({
        path,
        namespace: httpFetchNamespace,
      }),
    );
    onResolve(
      { filter: /.*/, namespace: httpFetchNamespace },
      ({ path, importer }) => ({
        path: new URL(path, importer).href,
        namespace: httpFetchNamespace,
      }),
    );

    const loaderList = new Map<string, Loader>([
      [".js", "js"],
      [".mjs", "js"],
      [".ts", "ts"],
      [".jsx", "jsx"],
      [".tsx", "tsx"],
      [".css", "css"],
      [".txt", "text"],
      [".json", "json"],
    ]);
    Object.entries(initialOptions.loader ?? {}).forEach(([key, value]) =>
      loaderList.set(key, value)
    );

    onLoad({ filter: /.*/, namespace: httpFetchNamespace }, async (args) => {
      const res = await fetch(args.path);
      const contentType = res.headers.get("content-type");
      const ext = getExtension(args.path, contentType);
      const contents = new Uint8Array(await res.arrayBuffer());
      return { contents, loader: loaderList.get(ext) ?? "default" };
    });
  },
};

function getExtension(path: string, contentType: string | null) {
  if (contentType !== null) {
    const ext = extension(contentType);
    if (ext !== undefined) return `.${ext}`;
  }
  return extname(path) || ".txt";
}
