import {
  Loader,
  OnLoadArgs,
  OnLoadResult,
  OnResolveArgs,
  OnResolveResult,
  Plugin,
} from "./deps/esbuild-wasm.ts";
import { isErr, isOk, Result, unwrapErr, unwrapOk } from "./deps/option-t.ts";
import { esbuildResolutionToURL } from "./esbuildResolution.ts";
import { extractSourceMapURL } from "./extractSourceMapURL.ts";
import { responseToLoader } from "./loader.ts";
import { toDataURL } from "./toDataURL.ts";

export interface RemoteLoaderInit {
  importMapURL?: URL;
  reload?: boolean | URLPattern[];
  fetch: RobustFetch;

  onProgress?: (message: LoadEvent) => void;
}

export interface NetworkError {
  name: "NetworkError";
  message: string;
  request: Request;
}
export interface AbortError {
  name: "AbortError";
  message: string;
  request: Request;
}
export interface HTTPError {
  name: "HTTPError";
  message: string;
  response: Response;
}

export type RobustFetch = (
  req: Request,
  cacheFirst: boolean,
) => Promise<
  Result<[Response, boolean], NetworkError | AbortError | HTTPError>
>;

export interface LoadEvent {
  path: string;
  done: Promise<{ size: number; loader: Loader; isCache: boolean }>;
}
export const remoteLoader = (
  options: RemoteLoaderInit,
): Plugin => ({
  name: "remote-loader",
  setup({ onLoad, onResolve }) {
    const handleResolve = (args: OnResolveArgs): OnResolveResult => ({
      path: args.path,
      namespace: args.namespace,
    });
    for (const protocol of [...supportedProtocols, ...notSupportedProtocols]) {
      onResolve(
        { filter: /.*/, namespace: protocol.slice(0, -1) },
        handleResolve,
      );
    }
    const handleLoad = (
      args: OnLoadArgs,
    ): Promise<OnLoadResult | undefined> =>
      load(
        esbuildResolutionToURL(args).href,
        options.fetch,
        options.reload,
        options.onProgress,
      );
    for (const protocol of supportedProtocols) {
      onLoad({ filter: /.*/, namespace: protocol.slice(0, -1) }, handleLoad);
    }
    for (const protocol of notSupportedProtocols) {
      onLoad({ filter: /.*/, namespace: protocol.slice(0, -1) }, () => {
        throw new Error(`${protocol} import is not supported yet.`);
      });
    }
  },
});

const supportedProtocols = ["http:", "https:", "data:"] as const;
const notSupportedProtocols = ["npm:", "jsr:", "node:"] as const;

const load = async (
  href: string,
  fetch: RobustFetch,
  reload?: boolean | URLPattern[],
  onProgress?: (message: LoadEvent) => void,
): Promise<OnLoadResult> => {
  const cacheFirst = !reload
    ? true
    : reload === true
    ? false
    : !reload.some((pattern) => pattern.test(href));

  const result = await fetch(new Request(href), cacheFirst);
  if (isErr(result)) {
    return { errors: [{ text: unwrapErr(result).message }] };
  }
  const [res, isCache] = unwrapOk(result);
  const loader = responseToLoader(res);
  onProgress?.({
    path: href,
    done: res.clone().blob().then((blob) => ({
      size: blob.size,
      loader,
      isCache,
    })),
  });
  const blob = await res.blob();
  {
    const contents = await blob.text();
    const result = extractSourceMapURL(contents, new URL(href));
    if (isOk(result)) {
      const { url, start, end } = unwrapOk(result);
      if (url.protocol !== "data:") {
        const res = await fetch(new Request(url), cacheFirst);
        if (isErr(res)) {
          return {
            contents: new Uint8Array(await blob.arrayBuffer()),
            loader,
            warnings: [{
              text: `[${
                unwrapErr(res).message
              }] Failed to fetch the source map URL`,
              notes: [{
                text: `Source map URL: ${url}`,
              }, {
                text: `Original URL: ${href}`,
              }],
              detail: unwrapErr(res),
            }],
          };
        }
        const dataURL = await unwrapOk(res)[0].blob().then(toDataURL);
        const replaced = contents.slice(0, start) + dataURL +
          contents.slice(end);
        return { contents: replaced, loader };
      }
    }
  }

  return { contents: new Uint8Array(await blob.arrayBuffer()), loader };
};
