import { build, initialize } from "./deps/esbuild-wasm.ts";
import { findLatestCache, saveApiCache } from "./deps/scrapbox.ts";
import { AvailableExtensions, extensionToLoader } from "./extension.ts";
import { isAllowedConnectSrc } from "./isAllowedConnectSrc.ts";
import { remoteLoader } from "./remoteLoader.ts";

export interface BundleOptions {
  extension: AvailableExtensions;
  fileName?: string;
  dirURL: string;
}

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
    }.${extensionToLoader(extension)}`;
    const baseURL = `${dirURL}${fileName}`;

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
        }),
      ],
      write: false,
    });
    return outputFiles[0].text;
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
