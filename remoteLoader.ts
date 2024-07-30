import {
  Loader,
  OnLoadResult,
  OnResolveArgs,
  OnResolveResult,
  Plugin,
} from "./deps/esbuild-wasm.ts";
import { isErr, isOk, Result, unwrapErr, unwrapOk } from "./deps/option-t.ts";
import {
  esbuildResolutionToURL,
  urlToEsbuildResolution,
} from "./esbuildResolution.ts";
import { extractSourceMapURL } from "./extractSourceMapURL.ts";
import {
  isLoaderWhichCanIncludeSourceMappingURL,
  responseToLoader,
} from "./loader.ts";
import {
  packageVersionMapping,
  resolveJsrSpecifier,
  resolveNpmSpecifier,
} from "./resolve.ts";
import { RobustFetch, robustFetch } from "./robustFetch.ts";
import {
  NotJsrProtocolError,
  NotNpmProtocolError,
  NpmSpecifier,
  OnlyScopeProvidedError,
  PackageNotFoundError,
  parseJsrSpecifier,
  parseNpmSpecifier,
  ScopeNotFoundError,
} from "./specifiers.ts";
import { toDataURL } from "./toDataURL.ts";

export interface RemoteLoaderInit {
  importMapURL?: URL;
  reload?: boolean | URLPattern[];
  fetch?: RobustFetch;

  onProgress?: (message: LoadEvent) => void;
}

export interface LoadEvent {
  path: URL;
  done: Promise<{ size: number; loader: Loader; isCache: boolean }>;
}
export const remoteLoader = (
  init: RemoteLoaderInit,
): Plugin => {
  const resolvedVersions: packageVersionMapping = new Map();

  const proxy = async (
    args: OnResolveArgs,
  ): Promise<OnResolveResult> => {
    const isNpm = args.namespace === "npm";
    const result: Result<
      NpmSpecifier,
      | NotNpmProtocolError
      | OnlyScopeProvidedError
      | PackageNotFoundError
      | NotJsrProtocolError
      | ScopeNotFoundError
    > = (isNpm ? parseNpmSpecifier : parseJsrSpecifier)(
      esbuildResolutionToURL(args),
    );
    if (isErr(result)) {
      const detail = unwrapErr(result);
      return { errors: [{ text: detail.name, detail }] };
    }
    const result2 = await (isNpm ? resolveNpmSpecifier : resolveJsrSpecifier)(
      unwrapOk(result),
      { resolvedVersions, ...init },
    );

    if (isErr(result2)) {
      const detail = unwrapErr(result2);
      return {
        errors: [{ text: `${detail.name} ${detail.message}`, detail }],
      };
    }

    return urlToEsbuildResolution(unwrapOk(result2));
  };

  return {
    name: "remote-loader",
    setup({ onLoad, onResolve, initialOptions }) {
      for (
        const protocol of [...supportedProtocols, ...notSupportedProtocols]
      ) {
        onResolve(
          { filter: /.*/, namespace: protocol.slice(0, -1) },
          handleResolve,
        );
      }

      onResolve({ filter: /.*/, namespace: "npm" }, proxy);
      onResolve({ filter: /.*/, namespace: "jsr" }, proxy);

      for (const protocol of supportedProtocols) {
        onLoad(
          { filter: /.*/, namespace: protocol.slice(0, -1) },
          (args) =>
            load(esbuildResolutionToURL(args), {
              ...init,
              sourcemap: initialOptions.sourcemap !== false &&
                initialOptions.sourcemap !== undefined,
            }),
        );
      }
      for (const protocol of notSupportedProtocols) {
        onLoad({ filter: /.*/, namespace: protocol.slice(0, -1) }, () => {
          throw new Error(`${protocol} import is not supported yet.`);
        });
      }
    },
  };
};

const handleResolve = (
  args: OnResolveArgs,
): OnResolveResult | Promise<OnResolveResult> => ({
  path: args.path,
  namespace: args.namespace,
});

const supportedProtocols = [
  "http:",
  "https:",
  "data:",
] as const;
const notSupportedProtocols = ["node:"] as const;

interface LoadInit extends RemoteLoaderInit {
  sourcemap: boolean;
}
const load = async (
  url: URL,
  init: LoadInit,
): Promise<OnLoadResult> => {
  const cacheFirst = !init.reload
    ? true
    : init.reload === true
    ? false
    : !init.reload.some((pattern) => pattern.test(url));
  const fetch = init.fetch ?? robustFetch;

  const result = await fetch(new Request(url), cacheFirst);
  if (isErr(result)) {
    const detail = unwrapErr(result);
    return {
      errors: [{
        text: `[${detail.message}] Failed to fetch ${url}`,
        detail: unwrapErr(result),
      }],
    };
  }
  const [res, isCache] = unwrapOk(result);
  const loader = responseToLoader(res);
  init.onProgress?.({
    path: url,
    done: res.clone().blob().then((blob) => ({
      size: blob.size,
      loader,
      isCache,
    })),
  });
  const blob = await res.blob();
  if (init.sourcemap && isLoaderWhichCanIncludeSourceMappingURL(loader)) {
    const contents = await blob.text();
    const result = extractSourceMapURL(contents, url);
    if (isOk(result)) {
      const { url: sourceMappingURL, start, end } = unwrapOk(result);
      if (sourceMappingURL.protocol !== "data:") {
        const res = await fetch(new Request(sourceMappingURL), cacheFirst);
        if (isErr(res)) {
          return {
            contents,
            loader,
            warnings: [{
              text: `[${
                unwrapErr(res).message
              }] Failed to fetch the source map URL`,
              notes: [{
                text: `Source map URL: ${sourceMappingURL}`,
              }, {
                text: `Original URL: ${url}`,
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
