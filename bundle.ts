import { build, initialize } from "./deps/esbuild-wasm.ts";
import { resolver } from "./deps/esbuild_deno_loader.ts";
import { findLatestCache, saveApiCache } from "./deps/scrapbox.ts";
import { AvailableExtensions } from "./extension.ts";
import { isAllowedConnectSrc } from "./isAllowedConnectSrc.ts";
import { remoteLoader } from "./remoteLoader.ts";

export interface BundleOptions {
  extension: AvailableExtensions;
  fileName?: string;
  dirURL: string;
}

export interface BundleResult {
  /** built code */
  contents: string;
}

type Builder = (entryPoint: string) => Promise<BundleResult>;
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

  return async (entryPoint) => {
    const { outputFiles } = await build({
      entryPoints: [entryPoint],
      format: "esm",
      bundle: true,
      minify: true,
      charset: "utf8",
      plugins: [
        resolver(),
        remoteLoader({
          fetch: fetchCORS,
          reload: [
            new URLPattern({ hostname: location.hostname }),
            new URLPattern({ hostname: "scrapbox.io" }),
          ],
        }),
      ],
      write: false,
    });

    return {
      contents: outputFiles[0].text,
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
