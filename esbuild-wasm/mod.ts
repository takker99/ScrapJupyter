// deno-lint-ignore-file
/** esbuild-wasm@0.14.11
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
 */
// This code is copied from https://raw.githubusercontent.com/evanw/esbuild/v0.12.25/lib/npm/browser.ts and modified below:
// - load worker src from URL instead of embedded code
// -$ deno fmt
import * as types from "./types.ts";
import * as common from "./common.ts";
import { ESBUILD_VERSION } from "./version.ts";

export let version = ESBUILD_VERSION;

export let build: typeof types.build = (
  options: types.BuildOptions,
): Promise<any> => ensureServiceIsRunning().build(options);

export const serve: typeof types.serve = () => {
  throw new Error(`The "serve" API only works in node`);
};

export const transform: typeof types.transform = (input, options) =>
  ensureServiceIsRunning().transform(input, options);

export const formatMessages: typeof types.formatMessages = (
  messages,
  options,
) => ensureServiceIsRunning().formatMessages(messages, options);

export const buildSync: typeof types.buildSync = () => {
  throw new Error(`The "buildSync" API only works in node`);
};

export const transformSync: typeof types.transformSync = () => {
  throw new Error(`The "transformSync" API only works in node`);
};

export const formatMessagesSync: typeof types.formatMessagesSync = () => {
  throw new Error(`The "formatMessagesSync" API only works in node`);
};

interface Service {
  build: typeof types.build;
  transform: typeof types.transform;
  formatMessages: typeof types.formatMessages;
}

let initializePromise: Promise<void> | undefined;
let longLivedService: Service | undefined;

let ensureServiceIsRunning = (): Service => {
  if (longLivedService) return longLivedService;
  if (initializePromise) {
    throw new Error(
      'You need to wait for the promise returned from "initialize" to be resolved before calling this',
    );
  }
  throw new Error('You need to call "initialize" before calling this');
};

export const initialize: typeof types.initialize = (options) => {
  options = common.validateInitializeOptions(options || {});
  let wasmURL = options.wasmURL;
  const workerURL = options.workerURL;
  let useWorker = options.worker !== false;
  if (!wasmURL) throw new Error('Must provide the "wasmURL" option');
  if (!workerURL) throw new Error('Must provide the "workerURL" option');
  wasmURL += "";
  if (initializePromise) {
    throw new Error('Cannot call "initialize" more than once');
  }
  initializePromise = startRunningService(wasmURL, workerURL, useWorker);
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
  let res = await fetch(wasmURL);
  if (!res.ok) throw new Error(`Failed to download ${JSON.stringify(wasmURL)}`);
  let wasm = await res.arrayBuffer();
  let worker: {
    onmessage: ((event: any) => void) | null;
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
    let fn = new Function(
      "postMessage",
      await workerRes.text() + `var onmessage; return m => onmessage(m)`,
    );
    //@ts-ignore delete later
    let onmessage = fn((data: Uint8Array) => worker.onmessage!({ data }));
    worker = {
      onmessage: null,
      postMessage: (data: unknown) => onmessage({ data }),
      terminate() {
      },
    };
  }

  worker.postMessage(wasm);
  worker.onmessage = ({ data }: MessageEvent<Uint8Array>) =>
    readFromStdout(data);

  let { readFromStdout, service } = common.createChannel({
    writeToStdin(bytes) {
      worker.postMessage(bytes);
    },
    isSync: false,
    isBrowser: true,
  });

  longLivedService = {
    build: (options: types.BuildOptions): Promise<any> =>
      new Promise<types.BuildResult>((resolve, reject) =>
        service.buildOrServe({
          callName: "build",
          refs: null,
          serveOptions: null,
          options,
          isTTY: false,
          defaultWD: "/",
          callback: (err, res) =>
            err ? reject(err) : resolve(res as types.BuildResult),
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
