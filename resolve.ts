import {
  createErr,
  createOk,
  isErr,
  Result,
  unwrapOk,
} from "./deps/option-t.ts";
import {
  format,
  maxSatisfying,
  Range,
  SemVer,
  tryParse,
} from "./deps/semver.ts";
import { getJsrPackageMetadata } from "./getJsrPackageMetadata.ts";
import { getJsrPackageVersionMetadata } from "./getJsrPackageVersionMetadata.ts";
import { getNpmPackageMetadata } from "./getNpmPackageMetadata.ts";
import {
  AbortError,
  HTTPError,
  NetworkError,
  RobustFetch,
} from "./robustFetch.ts";
import { JsrSpecifier, NpmSpecifier } from "./specifiers.ts";

export type packageVersionMapping = Map<
  string,
  [SemVer, Record<string, string>][]
>;

export interface InvalidPackageVersionError {
  name: "InvalidPackageVersionError";
  message: string;
  packageName: string;
  range: Range;
  tag?: string;
  entryPoint: "." | `./${string}`;
  availableVersions: string[];
}
const invalidPackageVersionError = (
  specifier: NpmSpecifier,
  availableVersions: string[],
): InvalidPackageVersionError => ({
  name: "InvalidPackageVersionError",
  message: `No version of ${specifier.name} satisfies "${
    specifier.tag ?? "*"
  }" (available: ${availableVersions.slice(0, 10).join(", ")}${
    availableVersions.length > 10
      ? `, ... (${availableVersions.length - 10} more versions)`
      : ""
  })`,
  packageName: specifier.name,
  range: specifier.range,
  tag: specifier.tag,
  entryPoint: specifier.entryPoint,
  availableVersions,
});

export interface InvalidEntryPointError {
  name: "InvalidEntryPointError";
  message: string;
  packageName: string;
  range: Range;
  tag?: string;
  entryPoint: "." | `./${string}`;
  availableEntryPoints: string[];
}
const invalidEntryPointError = (
  specifier: NpmSpecifier,
  availableEntryPoints: string[],
): InvalidEntryPointError => ({
  name: "InvalidEntryPointError",
  message:
    `${specifier.entryPoint} is not a valid entry point for ${specifier.name}@${
      specifier.tag ?? "*"
    } (available: ${availableEntryPoints.join(", ")})`,
  packageName: specifier.name,
  range: specifier.range,
  tag: specifier.tag,
  entryPoint: specifier.entryPoint,
  availableEntryPoints,
});

export interface ResolveSpecifierOptions {
  resolvedVersions?: packageVersionMapping;
  fetch?: RobustFetch;
  cacheFirst?: boolean;
}

export const resolveNpmSpecifier = async (
  npm: NpmSpecifier,
  options?: ResolveSpecifierOptions,
): Promise<
  Result<
    URL,
    | InvalidPackageVersionError
    | InvalidEntryPointError
    | NetworkError
    | AbortError
    | HTTPError
  >
> => {
  if (options?.resolvedVersions) {
    const versions = new Map(options.resolvedVersions.get(npm.name) ?? []);
    const version = maxSatisfying([...versions.keys()], npm.range);
    if (version) {
      const exports = versions.get(version) ?? {};
      const path = exports[npm.entryPoint];

      if (typeof path !== "string") console.log(path);
      return path
        ? createOk(toEsmShUrl(npm.name, format(version), path))
        : createErr(
          invalidEntryPointError(npm, Object.keys(exports)),
        );
    }
  }
  const result = await getNpmPackageMetadata(npm.name, options);
  if (isErr(result)) return result;
  const metadata = unwrapOk(result);
  const versions = new Map(
    Object.entries(metadata.versions).flatMap(([v, { exports }]) => {
      const version = tryParse(v);
      return version ? [[version, exports ?? { ".": "./" }]] : [];
    }),
  );
  const version = maxSatisfying([...versions.keys()], npm.range);
  if (!version) {
    return createErr(
      invalidPackageVersionError(npm, Object.keys(metadata.versions)),
    );
  }
  const exports: Record<string, string> = {};
  for (const key of Object.keys(versions.get(version) ?? {})) {
    exports[key] = key;
  }
  const path = exports[npm.entryPoint];
  if (path) {
    options?.resolvedVersions?.set(npm.name, [
      ...(options.resolvedVersions.get(npm.name) ?? []),
      [version, exports],
    ]);
    return createOk(toEsmShUrl(npm.name, format(version), path));
  }
  return createErr(invalidEntryPointError(npm, Object.keys(exports)));
};

const toEsmShUrl = (name: string, version: string, path: string): URL =>
  new URL(path, `https://esm.sh/${name}@${version}/`);

export const resolveJsrSpecifier = async (
  jsr: JsrSpecifier,
  options?: ResolveSpecifierOptions,
): Promise<
  Result<
    URL,
    | InvalidPackageVersionError
    | InvalidEntryPointError
    | NetworkError
    | AbortError
    | HTTPError
  >
> => {
  if (options?.resolvedVersions) {
    const versions = new Map(options.resolvedVersions.get(jsr.name) ?? []);
    const version = maxSatisfying([...versions.keys()], jsr.range);
    if (version) {
      const exports = versions.get(version) ?? {};
      const path = exports[jsr.entryPoint];
      return path
        ? createOk(toJsrUrl(jsr.name, format(version), path))
        : createErr(
          invalidEntryPointError(jsr, Object.keys(exports)),
        );
    }
  }
  const result = await resolveJsrVersion(jsr, options);
  if (isErr(result)) return result;
  const version = unwrapOk(result);
  const result2 = await getJsrPackageVersionMetadata(
    jsr.name,
    format(version),
    options,
  );
  if (isErr(result2)) return result2;
  const exports = unwrapOk(result2).exports;
  const path = exports[jsr.entryPoint];
  if (path) {
    options?.resolvedVersions?.set(jsr.name, [
      ...(options.resolvedVersions.get(jsr.name) ?? []),
      [version, exports],
    ]);

    return createOk(toJsrUrl(jsr.name, format(version), path));
  }
  return createErr(
    invalidEntryPointError(jsr, Object.keys(unwrapOk(result2).exports)),
  );
};

const toJsrUrl = (name: string, version: string, path: string): URL =>
  new URL(path, `https://jsr.io/${name}/${version}/`);

const resolveJsrVersion = async (
  jsr: JsrSpecifier,
  options?: ResolveSpecifierOptions,
): Promise<
  Result<
    SemVer,
    InvalidPackageVersionError | NetworkError | AbortError | HTTPError
  >
> => {
  const result = await getJsrPackageMetadata(jsr.name, options);
  if (isErr(result)) return result;
  const metadata = unwrapOk(result);
  const versions = Object.keys(metadata.versions).flatMap((v) => {
    const version = tryParse(v);
    return version ? [version] : [];
  });
  const version = maxSatisfying(versions, jsr.range);
  return version ? createOk(version) : createErr(
    invalidPackageVersionError(jsr, Object.keys(metadata.versions)),
  );
};
