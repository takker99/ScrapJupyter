// ported from https://github.com/lucacasonato/esbuild_deno_loader/blob/0.10.3/src/shared.ts

import { fromFileUrl, toFileUrl } from "./deps/path.ts";

/** Esbuild's representation of a module specifier. */
export interface EsbuildResolution {
  /** The namespace, like `file`, `https`, or `npm`. */
  namespace: string;
  /** The path. When the namespace is `file`, this is a file path. Otherwise
   * this is everything in a URL with the namespace as the scheme, after the
   * `:` of the scheme. */
  path: string;
}

/**
 * Turn a URL into an {@link EsbuildResolution} by splitting the URL into a
 * namespace and path.
 *
 * For file URLs, the path returned is a file path not a URL path representing a
 * file.
 */
export const urlToEsbuildResolution = (url: URL): EsbuildResolution => {
  if (url.protocol === "file:") {
    return { path: fromFileUrl(url), namespace: "file" };
  }

  const namespace = url.protocol.slice(0, -1);
  const path = url.href.slice(namespace.length + 1);
  return { path, namespace };
};

/**
 * Turn an {@link EsbuildResolution} into a URL by joining the namespace and
 * path into a URL string.
 *
 * For file URLs, the path is interpreted as a file path not as a URL path
 * representing a file.
 */
export const esbuildResolutionToURL = (specifier: EsbuildResolution): URL => {
  if (specifier.namespace === "file") {
    return toFileUrl(specifier.path);
  }

  return new URL(`${specifier.namespace}:${specifier.path}`);
};
