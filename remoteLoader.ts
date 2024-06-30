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
import {
  esbuildResolutionToURL,
  urlToEsbuildResolution,
} from "./esbuildResolution.ts";
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
  loader: Loader;
  done: Promise<{ size: number; isCache: boolean }>;
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
        JSON.parse(importMapSource.contents),
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
            return info;
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
): Promise<Omit<Source, "path">> => {
  const source = sources.find((source) => source.path === href);

  if (source !== undefined) {
    progressCallback?.({
      type: "load",
      path: href,
      loader: source.loader ?? "text",
      done: Promise.resolve({
        size: new Blob([source.contents]).size,
        isCache: true,
      }),
    });
    return { contents: source.contents, loader: source.loader };
  }
  const cacheFirst = !reload
    ? true
    : reload === true
    ? false
    : !reload.some((pattern) => pattern.test(href));

  const result = fetch(new Request(href), cacheFirst);
  const [res] = await result;
  const loader = responseToLoader(res);
  progressCallback?.({
    type: "load",
    path: href,
    loader,
    done: result.then(([res, isCache]) => ({
      size: parseInt(res.headers.get("Content-Length") ?? "0"),
      isCache,
    })),
  });
  return { contents: await res.text(), loader };
};
