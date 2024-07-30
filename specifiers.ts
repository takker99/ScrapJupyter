// based on https://github.com/lucacasonato/esbuild_deno_loader/blob/0.10.3/src/shared.ts
// Copyright 2021 Luca Casonato. All rights reserved. MIT license.

import { createErr, createOk, Result } from "./deps/option-t.ts";
import { ALL, Range, tryParseRange } from "./deps/semver.ts";

export interface NpmSpecifier {
  name: string;
  range: Range;
  /** raw version string */
  tag?: string;
  entryPoint: "." | `./${string}`;
}
export interface NotNpmProtocolError {
  name: "NotNpmProtocolError";
  specifier: URL;
}
export interface OnlyScopeProvidedError {
  name: "OnlyScopeProvidedError";
  specifier: URL;
}
const onlyScopeProvidedError = (specifier: URL): OnlyScopeProvidedError => ({
  name: "OnlyScopeProvidedError",
  specifier,
});
export interface PackageNotFoundError {
  name: "PackageNotFoundError";
  specifier: URL;
}
const packageNotFoundError = (specifier: URL): PackageNotFoundError => ({
  name: "PackageNotFoundError",
  specifier,
});
export interface InvalidNpmSpecifierError {
  name: "InvalidNpmSpecifierError";
  specifier: URL;
}

export const parseNpmSpecifier = (
  specifier: URL,
): Result<
  NpmSpecifier,
  NotNpmProtocolError | OnlyScopeProvidedError | PackageNotFoundError
> => {
  if (specifier.protocol !== "npm:") {
    return createErr({ name: "NotNpmProtocolError", specifier });
  }
  const path = specifier.pathname;
  const startIndex = path[0] === "/" ? 1 : 0;
  let pathStartIndex;
  let versionStartIndex;
  if (path[startIndex] === "@") {
    const firstSlash = path.indexOf("/", startIndex);
    if (firstSlash === -1) return createErr(onlyScopeProvidedError(specifier));
    pathStartIndex = path.indexOf("/", firstSlash + 1);
    versionStartIndex = path.indexOf("@", firstSlash + 1);
  } else {
    pathStartIndex = path.indexOf("/", startIndex);
    versionStartIndex = path.indexOf("@", startIndex);
  }

  if (pathStartIndex === -1) pathStartIndex = path.length;
  if (versionStartIndex === -1) versionStartIndex = path.length;

  versionStartIndex = Math.min(versionStartIndex, pathStartIndex);

  if (startIndex === versionStartIndex) {
    return createErr(packageNotFoundError(specifier));
  }

  const name = path.slice(startIndex, versionStartIndex);
  const tag = path.slice(versionStartIndex + 1, pathStartIndex);
  const range = tag ? tryParseRange(tag) ?? [[ALL]] : [[ALL]];
  const rawEntryPoint = path.slice(pathStartIndex + 1);
  const entryPoint = rawEntryPoint
    ? `./${rawEntryPoint}` as const
    : "." as const;
  const npm: NpmSpecifier = { name, range, entryPoint };
  if (tag) npm.tag = tag;

  return createOk(npm);
};

export interface JsrSpecifier extends NpmSpecifier {}
export interface NotJsrProtocolError {
  name: "NotJsrProtocolError";
  specifier: URL;
}
export interface ScopeNotFoundError {
  name: "ScopeNotFoundError";
  specifier: URL;
}

export const parseJsrSpecifier = (
  specifier: URL,
): Result<
  JsrSpecifier,
  NotJsrProtocolError | ScopeNotFoundError | PackageNotFoundError
> => {
  if (specifier.protocol !== "jsr:") {
    return createErr({ name: "NotJsrProtocolError", specifier });
  }
  const path = specifier.pathname;
  const startIndex = path[0] === "/" ? 1 : 0;
  if (path[startIndex] !== "@") {
    return createErr({ name: "ScopeNotFoundError", specifier });
  }
  const firstSlash = path.indexOf("/", startIndex);
  if (firstSlash === -1) return createErr(packageNotFoundError(specifier));
  let pathStartIndex = path.indexOf("/", firstSlash + 1);
  let versionStartIndex = path.indexOf("@", firstSlash + 1);

  if (pathStartIndex === -1) pathStartIndex = path.length;
  if (versionStartIndex === -1) versionStartIndex = path.length;

  versionStartIndex = Math.min(versionStartIndex, pathStartIndex);
  const name = path.slice(startIndex, versionStartIndex);
  const tag = path.slice(versionStartIndex + 1, pathStartIndex);
  const range = tag ? tryParseRange(tag) ?? [[ALL]] : [[ALL]];
  const rawEntryPoint = path.slice(pathStartIndex + 1);
  const entryPoint = rawEntryPoint
    ? `./${rawEntryPoint}` as const
    : "." as const;
  const jsr: JsrSpecifier = { name, range, entryPoint };
  if (tag) jsr.tag = tag;

  return createOk(jsr);
};
