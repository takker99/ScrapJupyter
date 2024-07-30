import { mapAsyncForResult, Result } from "./deps/option-t.ts";
import {
  AbortError,
  HTTPError,
  NetworkError,
  RobustFetch,
  robustFetch,
} from "./robustFetch.ts";

// cf. https://github.com/jsr-io/jsr/blob/c2a8b66449a7a8290b249dfa714468ce75d83a88/api/src/metadata.rs#L38-L64
export interface JsrPackageMetadata {
  scope: string;
  name: string;
  latest?: string;
  versions: Record<string, { yanked?: true }>;
}
export interface GetJsrPackageMetadataOptions {
  endpoint?: string;
  fetch?: RobustFetch;
  cacheFirst?: boolean;
}

export const JSR_REGISTORY_ENDPOINT = "https://jsr.io";

/** Get https://jsr.io/{scope}/{name}/meta.json
 *
 * For more information, see https://jsr.io/docs/api#package-metadata
 */
export const getJsrPackageMetadata = async (
  name: string,
  options?: GetJsrPackageMetadataOptions,
): Promise<
  Result<JsrPackageMetadata, NetworkError | AbortError | HTTPError>
> => {
  const result = await (options?.fetch ?? robustFetch)(
    new Request(
      `${options?.endpoint ?? JSR_REGISTORY_ENDPOINT}/${name}/meta.json`,
    ),
    options?.cacheFirst,
  );
  return mapAsyncForResult(
    result,
    ([res]) => res.json() as Promise<JsrPackageMetadata>,
  );
};
