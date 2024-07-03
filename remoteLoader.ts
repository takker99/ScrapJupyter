import {
  Loader,
  OnLoadArgs,
  OnLoadResult,
  Plugin,
} from "./deps/esbuild-wasm.ts";
import {
  ImportMap,
  resolveImportMap,
  resolveModuleSpecifier,
} from "./deps/importmap.ts";
import { toFileUrl } from "./deps/path.ts";
import { escape } from "./deps/regexp.ts";
import { basename, extname } from "./deps/url.ts";
import {
  esbuildResolutionToURL,
  urlToEsbuildResolution,
} from "./esbuildResolution.ts";
import { extensionToLoader, isAvailableExtensions } from "./extension.ts";
import { responseToLoader } from "./loader.ts";

export interface RemoteLoaderInit {
  importMapURL?: URL;
  reload?: boolean | URLPattern[];
  sources?: Source[];
  fetch: (req: Request, cacheFirst: boolean) => Promise<[Response, boolean]>;

  progressCallback?: (message: ResolveInfo | LoadInfo) => void;
}

export interface Source {
  path: string;
  contents: string;
  loader?: Loader;
}

export interface ResolveInfo {
  type: "resolve";
  external: boolean;
  path: string;
  parent?: string;
}

export interface LoadInfo {
  type: "load";
  path: string;
  done: Promise<{ size: number; loader: Loader; isCache: boolean }>;
}

export const remoteLoader = (
  options: RemoteLoaderInit,
): Plugin => ({
  name: "remote-resource",
  setup({ onStart, onResolve, onLoad, initialOptions }) {
    const {
      importMapURL,
      sources = [],
      progressCallback,
    } = options ?? {};

    let importMap: ImportMap = {};

    onStart(async () => {
      if (!importMapURL) return;
      const importMapSource = await load(
        `${importMapURL}`,
        options.fetch,
        sources,
        options.reload,
        progressCallback,
      );
      importMap = resolveImportMap(
        JSON.parse(
          importMapSource.contents instanceof Uint8Array
            ? new TextDecoder().decode(importMapSource.contents)
            : importMapSource.contents ?? "",
        ),
        importMapURL,
      );
    });

    const externalRegexps = (initialOptions.external ?? []).map((path) =>
      new RegExp(escape(path).replace(/\\\*/g, ".*"))
    );

    onResolve(
      { filter: /.*/ },
      (args) => {
        // This code is based on https://github.com/lucacasonato/esbuild_deno_loader/blob/0.10.3/src/plugin_deno_resolver.ts

        // The first pass resolver performs synchronous resolution. This
        // includes relative to absolute specifier resolution and import map
        // resolution.

        // We have to first determine the referrer URL to use when resolving
        // the specifier. This is either the importer URL, or the resolveDir
        // URL if the importer is not specified (ie if the specifier is at the
        // root).
        let referrer: URL;
        if (args.importer !== "") {
          if (args.namespace === "") {
            throw new Error("[assert] namespace is empty");
          }
          referrer = new URL(`${args.namespace}:${args.importer}`);
        } else if (args.resolveDir !== "") {
          referrer = new URL(`${toFileUrl(args.resolveDir).href}/`);
        } else {
          return undefined;
        }

        // We can then resolve the specifier relative to the referrer URL. If
        // an import map is specified, we use that to resolve the specifier.
        let resolved: URL;
        if (importMap !== null) {
          const res = resolveModuleSpecifier(
            args.path,
            importMap,
            new URL(referrer),
          );
          resolved = new URL(res);
        } else {
          resolved = new URL(args.path, referrer);
        }

        const info: ResolveInfo = {
          type: "resolve",
          external: false,
          path: resolved.href,
        };
        if (args.kind !== "entry-point") info.parent = referrer.href;

        for (const externalRegexp of externalRegexps) {
          if (externalRegexp.test(resolved.href)) {
            info.external = true;
            progressCallback?.(info);
            return { path: info.path, external: info.external };
          }
        }
        progressCallback?.(info);

        // Now pass the resolved specifier back into the resolver, for a second
        // pass. Now plugins can perform any resolution they want on the fully
        // resolved specifier.
        return urlToEsbuildResolution(resolved);
        // res.then(console.log);
      },
    );

    const loader = (
      args: OnLoadArgs,
    ): Promise<OnLoadResult | undefined> =>
      load(
        esbuildResolutionToURL(args).href,
        options.fetch,
        sources,
        options.reload,
        progressCallback,
      );

    onLoad({ filter: /.*/, namespace: "file" }, loader);
    onLoad({ filter: /.*/, namespace: "http" }, loader);
    onLoad({ filter: /.*/, namespace: "https" }, loader);
    onLoad({ filter: /.*/, namespace: "data" }, loader);
  },
});

const load = async (
  href: string,
  fetch: (req: Request, cacheFirst: boolean) => Promise<[Response, boolean]>,
  sources: Source[],
  reload?: boolean | URLPattern[],
  progressCallback?: (message: ResolveInfo | LoadInfo) => void,
): Promise<OnLoadResult> => {
  const source = sources.find((source) => source.path === href);

  if (source !== undefined) {
    const extension = extname(href).slice(1) || basename(href);

    const loader = source.loader ??
      (isAvailableExtensions(extension)
        ? extensionToLoader(extension)
        : "text");
    progressCallback?.({
      type: "load",
      path: href,
      done: Promise.resolve({
        size: new Blob([source.contents]).size,
        loader,
        isCache: true,
      }),
    });
    return { contents: source.contents, loader };
  }
  const cacheFirst = !reload
    ? true
    : reload === true
    ? false
    : !reload.some((pattern) => pattern.test(href));

  const result = fetch(new Request(href), cacheFirst).then(([res, isCache]) => {
    const loader = responseToLoader(res);
    return res.blob().then((blob) => [blob, loader, isCache] as const);
  });
  progressCallback?.({
    type: "load",
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
