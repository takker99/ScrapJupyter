/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="dom" />
import type { Loader, Plugin } from "./deps/esbuild-wasm.ts";
import type { ImportInfo, SkipInfo } from "./deps/protcols.ts";
import {
  ImportMap,
  resolveImportMap,
  resolveModuleSpecifier,
} from "./deps/importmap.ts";
import { relativeURL } from "./deps/path.ts";
import { getLoader } from "./deps/loader.ts";
import { isBareModuleName } from "./utils.ts";

export interface Options {
  importmap?: ImportMap;
  baseURL: URL;
  sources?: {
    path: string;
    contents: string;
    loader: Loader;
  }[];
  progressCallback?: (message: ImportInfo | SkipInfo) => void;
}

const name = "remote-resource";
export const remoteLoader = (
  options: Options,
): Plugin => ({
  name,
  setup({ onResolve, onLoad, initialOptions: { external = [] } }) {
    const {
      importmap = { imports: {} },
      baseURL,
      sources = [],
      progressCallback,
    } = options ?? {};

    const importMap = resolveImportMap(importmap, baseURL);
    external = external.map((path) =>
      isBareModuleName(path) ? path : new URL(path, baseURL).href
    );

    onResolve(
      { filter: /.*/ },
      ({ path, importer }) => {
        if (!isBareModuleName(path)) {
          importer = importer === "<stdin>" ? baseURL.href : importer;
          path = new URL(path, importer).href;
        }
        const resolvedPath = resolveModuleSpecifier(path, importMap, baseURL);

        if (isBareModuleName(resolvedPath)) {
          progressCallback?.({
            type: "skip",
            url: resolvedPath,
          });
          return { external: true, path: resolvedPath };
        }

        if (external.includes(resolvedPath)) {
          progressCallback?.({
            type: "skip",
            url: resolvedPath,
          });
          return {
            external: true,
            path: relativeURL(baseURL, new URL(resolvedPath)),
          };
        }

        return {
          path: decodeURI(resolvedPath),
          namespace: name,
        };
      },
    );
    onLoad({ filter: /^http|^file/, namespace: name }, async ({ path }) => {
      try {
        const source = sources.find((source) => source.path === path);

        if (source !== undefined) {
          progressCallback?.({
            type: "cache",
            url: path,
          });
          return { contents: source.contents, loader: source.loader };
        }
        const response = await fetch(path);
        progressCallback?.({
          type: "remote",
          url: path,
        });
        return { contents: await response.text(), loader: getLoader(response) };
      } catch (e) {
        if (!(e instanceof Response)) {
          throw e;
        }
        progressCallback?.({
          type: "fetch error",
          url: path,
          data: { status: e.status, statusText: e.statusText },
        });
        return;
      }
    });
  },
});
