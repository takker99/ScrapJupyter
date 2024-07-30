import { createErr, createOk, Result } from "./deps/option-t.ts";

export interface NetworkError {
  name: "NetworkError";
  message: string;
  request: Request;
}
export interface AbortError {
  name: "AbortError";
  message: string;
  request: Request;
}
export interface HTTPError {
  name: "HTTPError";
  message: string;
  response: Response;
}

/**
 * Represents a function that performs a robust fetch operation.
 *
 * @param req - The request to be fetched.
 * @param cacheFirst - Optional parameter indicating whether to prioritize cache over network. Default is `false`.
 * @returns A promise that resolves to a tuple containing the response and a boolean indicating if the response was retrieved from cache.
 */
/**
 * Represents a function that makes a robust HTTP request.
 *
 * - If the request is successful, returns a `Result` object with the successful response and an error flag set to false.
 * - If the request fails due to a network error, returns a `Result` object with a {@link NetworkError}.
 * - If the request is aborted, returns a `Result` object with an {@link AbortError}.
 * - If the request fails due to an HTTP error status, returns a `Result` object with an {@link HTTPError}.
 *
 * @param request - The request to be sent.
 * @param cacheFirst - Optional parameter indicating whether to prioritize cache over network. Default is `false`.
 * @returns A promise that resolves to a `result` object, whick contains either a tuple containing a successful response and a boolean indicating if the response was retrieved from cache, or an error.
 */
export type RobustFetch = (
  req: Request,
  cacheFirst?: boolean,
) => Promise<
  Result<[Response, boolean], NetworkError | AbortError | HTTPError>
>;

/**
 * The reference implementation of a {@link RobustFetch} function.
 *
 * @param request - The request to be sent.
 * @returns A promise that resolves to a `result` object, whick contains either a tuple containing a successful response and a boolean indicating if the response was retrieved from cache, or an error.
 */
export const robustFetch: RobustFetch = async (request) => {
  try {
    const res = await fetch(request);
    return res.ok ? createOk([res, false]) : createErr({
      name: "HTTPError",
      message: `${res.status} ${res.statusText}`,
      response: res,
    });
  } catch (e: unknown) {
    if (e instanceof TypeError) {
      return createErr({
        name: "NetworkError",
        message: e.message,
        request,
      });
    }
    if (e instanceof DOMException) {
      return createErr({
        name: "AbortError",
        message: e.message,
        request,
      });
    }
    throw e;
  }
};
