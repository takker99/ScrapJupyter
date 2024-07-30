import { build, initialize } from "./deps/esbuild-wasm.ts";
import { resolver } from "./deps/esbuild_deno_loader.ts";
import { createErr, createOk } from "./deps/option-t.ts";
import { findLatestCache, saveApiCache } from "./deps/scrapbox.ts";
import { AvailableExtensions } from "./extension.ts";
import { isAllowedConnectSrc } from "./isAllowedConnectSrc.ts";
import { remoteLoader } from "./remoteLoader.ts";
import { RobustFetch } from "./robustFetch.ts";
import "./deps/urlpattern-polyfill.ts";

export interface BundleOptions {
  extension: AvailableExtensions;
  fileName?: string;
  dirURL: string;
}

export interface BundleResult {
  /** built code */
  contents: string;
}

export type Builder = (entryPoint: string) => Promise<BundleResult>;

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
const fetchCORS: RobustFetch = async (
  req,
  cacheFirst,
) => {
  const fetch_ = isAllowedConnectSrc(new URL(req.url)) || !GM_fetch
    ? globalThis.fetch
    : GM_fetch;
  if (cacheFirst) {
    const result = await attemptFromCache(req);
    if (result) return result;
  }
  try {
    const res = await fetch_(req);
    if (res.ok) {
      if (fetch_ === GM_fetch && !req.url.startsWith("data:")) {
        await saveApiCache(req, res);
      }
      return createOk([res, false]);
    }
    const result = await attemptFromCache(req);
    return result ?? createErr({
      name: "HTTPError",
      message: `${res.status} ${res.statusText}`,
      response: res,
    });
  } catch (e: unknown) {
    const result = await attemptFromCache(req);
    if (result) return result;
    if (e instanceof TypeError) {
      return createErr({
        name: "NetworkError",
        message: e.message,
        request: req,
      });
    }
    if (e instanceof DOMException) {
      return createErr({
        name: "AbortError",
        message: e.message,
        request: req,
      });
    }
    throw e;
  }
};

const attemptFromCache = async (req: Request) => {
  if (req.url.startsWith("data:")) return;
  const res = await findLatestCache(req);
  if (res) {
    if (!res.url) Object.defineProperty(res, "url", { value: req.url });
    return createOk([res, true] as [Response, boolean]);
  }
};
