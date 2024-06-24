import { build, initialize } from "./deps/esbuild-wasm.ts";
import { downLines, findLatestCache, saveApiCache } from "./deps/scrapbox.ts";
import { AvailableExtensions, extensionToLoader } from "./extension.ts";
import { isAllowedConnectSrc } from "./isAllowedConnectSrc.ts";
import { remoteLoader } from "./remoteLoader.ts";

export interface BundleOptions {
  extension: AvailableExtensions;
  fileName?: string;
  dirURL: string;
}
export interface ImportGraph {
  path: string;
  isCache: boolean;
  children: ImportGraph[];
}

export interface BundleResult {
  /** built code */
  contents: string;

  graph: ImportGraph;
}

type Builder = (
  contents: string,
  options: BundleOptions,
) => Promise<BundleResult>;

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
    }.${extensionToLoader(extension)}`;
    const baseURL = `${dirURL}${fileName}`;
    const graphMap = new Map<string, ImportGraph>();

    const { outputFiles } = await build({
      entryPoints: [baseURL],
      format: "esm",
      bundle: true,
      minify: true,
      charset: "utf8",
      plugins: [
        remoteLoader({
          fetch: fetchCORS,
          reload: [
            new URLPattern({ hostname: location.hostname }),
            new URLPattern({ hostname: "scrapbox.io" }),
          ],
          sources: [{ path: baseURL, contents }],
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
        }),
      ],
      write: false,
    });

    return {
      contents: outputFiles[0].text,
      graph: graphMap.get(new URL(baseURL).href)!,
    };
  };
};

declare const GM_fetch: (typeof globalThis.fetch) | undefined;
const fetchCORS = async (
  req: Request,
  cacheFirst: boolean,
): Promise<[Response, boolean]> => {
  const fetch_ = isAllowedConnectSrc(new URL(req.url)) || !GM_fetch
    ? globalThis.fetch
    : GM_fetch;
  if (cacheFirst) {
    const res = await findLatestCache(req);
    if (res) {
      if (!res.url) Object.defineProperty(res, "url", { value: req.url });
      return [res, true];
    }
  }
  try {
    const res = await fetch_(req);
    if (res.ok) {
      if (fetch_ === GM_fetch) await saveApiCache(req, res);
      return [res, false];
    }
    throw new TypeError(`${res.status} ${res.statusText}`);
  } catch (e: unknown) {
    if (!(e instanceof TypeError)) throw e;
    const res = await findLatestCache(req);
    if (res) {
      if (!res.url) Object.defineProperty(res, "url", { value: req.url });
      return [res, true];
    }
    throw e;
  }
};

