import {
  createErr,
  createOk,
  isErr,
  okOrElseForMaybe,
  Result,
  unwrapOk,
} from "./deps/option-t.ts";

export interface InvalidURLError {
  name: "InvalidURLError";
  message: string;
}
export interface NotFoundError {
  name: "NotFoundError";
  message: string;
}
/**
 * Extracts the source map URL from the given code.
 *
 * This code is based on https://github.com/evanw/source-map-visualization/blob/f3e9dfec20e7bfd9625d03dd0d427affa74a9c43/code.js#L103-L145 under @evanw 's license.
 *
 * @param code - The code from which to extract the source map URL.
 * @param _lang - The language of the code (currently only supports `"js"`).
 * @returns The extracted source map URL as a `URL` object, or `null` if no source map URL is found.
 */
export const extractSourceMapURL = (
  code: string,
  base: string | URL | undefined,
): Result<
  { url: URL; start: number; end: number },
  InvalidURLError | NotFoundError
> => {
  const result = okOrElseForMaybe(
    extract(code),
    () => ({
      name: "NotFoundError",
      message: "Source map URL is not found",
    } as NotFoundError),
  );
  if (isErr(result)) return result;
  const { url, start, end } = unwrapOk(result);
  return URL.canParse(url, base)
    ? createOk({ url: new URL(url, base), start, end })
    : createErr({
      name: "InvalidURLError",
      message: `Invalid URL: ${url}`,
    });
};

const extract = (code: string) => {
  // Check for both "//" and "/*" comments. This is mostly done manually
  // instead of doing it all with a regular expression because Firefox's
  // regular expression engine crashes with an internal error when the
  // match is too big.
  for (const match of code.matchAll(/\/([*/])[#@] *sourceMappingURL=/g)) {
    const start = match.index + match[0].length;
    const n = code.length;
    let end = start;
    while (end < n && code.charCodeAt(end) > 32) {
      end++;
    }
    if (end === start) continue;
    if (match[1] === "/" || code.indexOf("*/", end) > 0) {
      return {
        url: code.slice(start, end),
        start,
        end,
      };
    }
  }
};
