/** esbuild-wasm@0.12.25
 *
 * MIT License
 *
 * Copyright (c) 2020 Evan Wallace
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */
// This code is copied from https://raw.githubusercontent.com/evanw/esbuild/v0.12.25/lib/npm/browser.ts and modified below:
// - load worker src from URL instead of embedded code
// -$ deno fmt
import {
  build as buildBase,
  BuildOptions,
  BuildResult,
  formatMessages as formatMessagesBase,
  initialize as initializeBase,
  transform as transformBase,
} from "./types.ts";
import { createChannel } from "./common.ts";
import { ESBUILD_VERSION } from "./version.ts";

export const version = ESBUILD_VERSION;

export const build: typeof buildBase = (
  options: BuildOptions,
) => ensureServiceIsRunning().build(options);

export const transform: typeof transformBase = (input, options) =>
  ensureServiceIsRunning().transform(input, options);

export const formatMessages: typeof formatMessagesBase = (
  messages,
  options,
) => ensureServiceIsRunning().formatMessages(messages, options);

interface Service {
  build: typeof buildBase;
  transform: typeof transformBase;
  formatMessages: typeof formatMessagesBase;
}

let initializePromise: Promise<void> | undefined;
let longLivedService: Service | undefined;

const ensureServiceIsRunning = (): Service => {
  if (longLivedService) return longLivedService;
  if (initializePromise) {
    throw new Error(
      'You need to wait for the promise returned from "initialize" to be resolved before calling this',
    );
  }
  throw new Error('You need to call "initialize" before calling this');
};

export const initialize: typeof initializeBase = (
  { wasmURL, workerURL, worker },
) => {
  wasmURL += "";
  if (initializePromise) {
    throw new Error('Cannot call "initialize" more than once');
  }
  initializePromise = startRunningService(wasmURL, workerURL, worker);
  initializePromise.catch(() => {
    // Let the caller try again if this fails
    initializePromise = void 0;
  });
  return initializePromise;
};

const startRunningService = async (
  wasmURL: string,
  workerURL: string,
  useWorker: boolean,
): Promise<void> => {
  const res = await fetch(wasmURL);
  if (!res.ok) throw new Error(`Failed to download ${JSON.stringify(wasmURL)}`);
  const wasm = await res.arrayBuffer();
  let worker: {
    onmessage: ((event: unknown) => void) | null;
    postMessage: (data: Uint8Array | ArrayBuffer) => void;
    terminate: () => void;
  } | Worker;

  if (useWorker) {
    // Run esbuild off the main thread
    worker = new Worker(workerURL);
  } else {
    // Run esbuild on the main thread
    const workerRes = await fetch(workerURL);
    if (!workerRes.ok) {
      throw new Error(`Failed to download ${JSON.stringify(wasmURL)}`);
    }
    const fn = new Function(
      "postMessage",
      `${await workerRes.text()}var onmessage; return m => onmessage(m)`,
    );
    //@ts-ignore delete later
    const onmessage = fn((data: Uint8Array) => worker.onmessage!({ data }));
    worker = {
      onmessage: null,
      postMessage: (data: unknown) => onmessage({ data }),
      terminate() {
      },
    };
  }

  worker.postMessage(wasm);

  const { readFromStdout, service } = createChannel({
    writeToStdin(bytes) {
      worker.postMessage(bytes);
    },
    isSync: false,
    isBrowser: true,
  });
  worker.onmessage = ({ data }: MessageEvent<Uint8Array>) =>
    readFromStdout(data);

  longLivedService = {
    build: (options: BuildOptions) =>
      new Promise<BuildResult>((resolve, reject) =>
        service.buildOrServe({
          callName: "build",
          refs: null,
          serveOptions: null,
          options,
          isTTY: false,
          defaultWD: "/",
          callback: (err, res) =>
            err ? reject(err) : resolve(res as BuildResult),
        })
      ),
    transform: (input, options) =>
      new Promise((resolve, reject) =>
        service.transform({
          callName: "transform",
          refs: null,
          input,
          options: options || {},
          isTTY: false,
          fs: {
            readFile(_, callback) {
              callback(new Error("Internal error"), null);
            },
            writeFile(_, callback) {
              callback(null);
            },
          },
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),
    formatMessages: (messages, options) =>
      new Promise((resolve, reject) =>
        service.formatMessages({
          callName: "formatMessages",
          refs: null,
          messages,
          options,
          callback: (err, res) => err ? reject(err) : resolve(res!),
        })
      ),
  };
};
