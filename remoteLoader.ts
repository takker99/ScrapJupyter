import {
  Loader,
  OnLoadArgs,
  OnLoadResult,
  OnResolveArgs,
  OnResolveResult,
  Plugin,
} from "./deps/esbuild-wasm.ts";
import { esbuildResolutionToURL } from "./esbuildResolution.ts";
import { responseToLoader } from "./loader.ts";

export interface RemoteLoaderInit {
  importMapURL?: URL;
  reload?: boolean | URLPattern[];
  fetch: (req: Request, cacheFirst: boolean) => Promise<[Response, boolean]>;

  onProgress?: (message: LoadEvent) => void;
}

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
    for (const protocol of supportedProtocols) {
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
  },
});

const supportedProtocols = [
  "http:",
  "https:",
  "data:",
  "npm:",
  "jsr:",
  "node:",
] as const;

const load = async (
  href: string,
  fetch: (req: Request, cacheFirst: boolean) => Promise<[Response, boolean]>,
  reload?: boolean | URLPattern[],
  onProgress?: (message: LoadEvent) => void,
): Promise<OnLoadResult> => {
  const cacheFirst = !reload
    ? true
    : reload === true
    ? false
    : !reload.some((pattern) => pattern.test(href));

  const result = fetch(new Request(href), cacheFirst).then(
    async ([res, isCache]) => {
      const loader = responseToLoader(res);
      const blob = await res.blob();
      return [blob, loader, isCache] as const;
    },
  );
  onProgress?.({
    path: href,
    done: result.then(([blob, loader, isCache]) => ({
      size: blob.size,
      loader,
      isCache,
    })),
  });
  const [blob, loader] = await result;
  return { contents: new Uint8Array(await blob.arrayBuffer()), loader };
};
