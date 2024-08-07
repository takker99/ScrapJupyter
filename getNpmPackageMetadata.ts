import { mapAsyncForResult, Result } from "./deps/option-t.ts";
import {
  AbortError,
  HTTPError,
  NetworkError,
  RobustFetch,
  robustFetch,
} from "./robustFetch.ts";

/** Represents the metadata of an NPM package in abbreviated form
 *
 * see https://github.com/npm/registry/blob/c164c1dddd9137ba2d0a265159fb996b3fa24ed6/docs/responses/package-metadata.md#abbreviated-metadata-format
 */
export interface NpmPackageMetadata {
  /** the package name */
  name: string;

  /** a mapping of dist tags to the versions they point to */
  "dist-tags": DistTags;

  /** ISO string of the last time this package was modified */
  modified: number;

  /** a mapping of version numbers to objects containing the information needed to install that version */
  versions: Record<string, AbbreviatedVersionObject>;
}

/** an object containing the information needed to install that version */
export interface AbbreviatedVersionObject {
  /** the package name */
  name: string;

  /** the version string for this version */
  version: string;

  /** the deprecation warnings message of this version */
  deprecated?: string;

  /** a mapping of other packages this version depends on to the required semver ranges */
  dependencies?: Record<string, string>;

  /** an object mapping package names to the required semver ranges of optional dependencies */
  optionalDependencies?: Record<string, string>;

  /** a mapping of package names to the required semver ranges of development dependencies */
  devDependencies?: Record<string, string>;

  /** an array of dependencies bundled with this version */
  bundleDependencies?: string[];

  /** a mapping of package names to the required semver ranges of peer dependencies */
  peerDependencies?: Record<string, string>;

  /** a mapping of peer package names to additional meta information for those peers */
  peerDependenciesMeta?: Record<string, string>;

  /** a mapping of bin commands to set up for this version */
  bin?: Record<string, string>;

  exports?: Record<string, unknown>;

  /** an array of directories included by this version */
  directories?: string[];

  /** a dist object */
  dist: Dist;

  /** the node engines required for this version to run, if specified */
  engines?: Record<string, string>;

  /** - `true` if this version is known to have a shrinkwrap that must be used to install it;
   * - `false` if this version is known not to have a shrinkwrap.
   * - If this field is `undefined`, the client must determine through other means if a shrinkwrap exists.
   */
  _hasShrinkwrap?: boolean;
  /** `true` if this version has the install scripts. */
  hasInstallScript?: boolean;

  /** an array of CPU architectures supported by the package */
  cpu?: string[];

  /** an array of operating systems supported by the package */
  os?: string[];
}

/** A mapping of dist tags to the versions they point to. */
export type DistTags = Partial<Record<string, string>> & { latest: string };

/** The dist object is generated by npm and may be relied upon. */
export interface Dist {
  /** the url of the tarball containing the payload for this package */
  tarball: string;

  /** the SHA-1 sum of the tarball */
  shasum: string;

  /** since Apr 2017, string in the format `<hashAlgorithm>-<base64-hash>`, refer the [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) and [cacache](https://github.com/npm/cacache#integrity) package for more */
  integrity?: string;

  /** since Feb 2018, the number of files in the tarball, folder excluded */
  fileCount?: number;

  /** since Feb 2018, the total byte of the unpacked files in the tarball */
  unpackedSize?: number;

  /** since Apr 2018, a PGP signature of `<package>@<version>:<integrity>`, refer the npm [blog](https://blog.npmjs.org/post/172999548390/new-pgp-machinery) and [doc](https://docs.npmjs.com/about-pgp-signatures-for-packages-in-the-public-registry) for more */
  "npm-signature"?: string;
}

export interface GetNpmPackageMetadataOptions {
  endpoint?: string;
  fetch?: RobustFetch;
  cacheFirst?: boolean;
}

/** run `https://registory.npmjs.org/{package}` to get the package metadata
 *
 * For more information, see https://github.com/npm/registry/blob/c164c1dddd9137ba2d0a265159fb996b3fa24ed6/docs/REGISTRY-API.md#getpackage
 */
export const getNpmPackageMetadata = async (
  name: string,
  options?: GetNpmPackageMetadataOptions,
): Promise<
  Result<NpmPackageMetadata, NetworkError | AbortError | HTTPError>
> => {
  const result = await (options?.fetch ?? robustFetch)(
    new Request(
      `${options?.endpoint ?? "https://registry.npmjs.org"}/${name}`,
    ),
    options?.cacheFirst,
  );
  return mapAsyncForResult(
    result,
    ([res]) => res.json() as Promise<NpmPackageMetadata>,
  );
};
