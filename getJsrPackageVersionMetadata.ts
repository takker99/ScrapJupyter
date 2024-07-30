import { mapAsyncForResult, Result } from "./deps/option-t.ts";
import {
  GetJsrPackageMetadataOptions,
  JSR_REGISTORY_ENDPOINT,
} from "./getJsrPackageMetadata.ts";
import {
  AbortError,
  HTTPError,
  NetworkError,
  robustFetch,
} from "./robustFetch.ts";

// cf. https://github.com/jsr-io/jsr/blob/c2a8b66449a7a8290b249dfa714468ce75d83a88/api/src/metadata.rs#L73-L116
export interface JsrPackageVersionMetadata {
  manifest: Record<string, ManifestEntry>;
  moduleGraph1?: Record<string, { yanked?: true }>;
  moduleGraph2?: Record<string, { yanked?: true }>;
  exports: Record<string, string>;
}

// cf. https://github.com/jsr-io/jsr/blob/c2a8b66449a7a8290b249dfa714468ce75d83a88/api/src/metadata.rs#L118-L122
export interface ManifestEntry {
  size: number;
  checksum: string;
}
export interface GetJsrPackageVersionMetadataOptions
  extends GetJsrPackageMetadataOptions {}

/** Get https://jsr.io/{scope}/{name}/{version}_meta.json
 *
 * For more information, see https://jsr.io/docs/api#package-version-metadata
 */
export const getJsrPackageVersionMetadata = async (
  name: string,
  version: string,
  options?: GetJsrPackageVersionMetadataOptions,
): Promise<
  Result<JsrPackageVersionMetadata, NetworkError | AbortError | HTTPError>
> => {
  const result = await (options?.fetch ?? robustFetch)(
    new Request(
      `${
        options?.endpoint ?? JSR_REGISTORY_ENDPOINT
      }/${name}/${version}_meta.json`,
    ),
    options?.cacheFirst,
  );
  return mapAsyncForResult(
    result,
    ([res]) => res.json() as Promise<JsrPackageVersionMetadata>,
  );
};
