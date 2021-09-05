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
// This code is copied from https://raw.githubusercontent.com/evanw/esbuild/v0.12.25/lib/shared/common.ts
import {
  BuildFailure,
  BuildOptions,
  BuildResult,
  FormatMessagesOptions,
  Message,
  Note,
  OnLoadArgs,
  OnLoadResult,
  OnResolveArgs,
  OnResolveResult,
  OnStartResult,
  PartialMessage,
  Plugin,
  ServeOptions,
  ServeResult,
  TransformOptions,
  TransformResult,
} from "./types.ts";
import {
  BuildOutputFile,
  BuildPlugin,
  BuildRequest,
  BuildResponse,
  decodePacket,
  decodeUTF8,
  encodePacket,
  encodeUTF8,
  FormatMsgsRequest,
  FormatMsgsResponse,
  OnLoadRequest,
  OnLoadResponse,
  OnRequestRequest,
  OnResolveRequest,
  OnResolveResponse,
  OnStartRequest,
  OnStartResponse,
  OnWaitRequest,
  OnWatchRebuildRequest,
  PingRequest,
  readUInt32LE,
  RebuildDisposeRequest,
  RebuildRequest,
  ServeResponse,
  ServeStopRequest,
  TransformRequest,
  TransformResponse,
  Value,
  WatchStopRequest,
} from "./stdio_protocol.ts";
import { ESBUILD_VERSION } from "./version.ts";
import {
  ensureNumber,
  ensureObject,
  ensureString,
} from "../deps/unknownutil.ts";
import {
  canBeAnything,
  checkForInvalidFlags,
  flagsForBuildOptions,
  flagsForTransformOptions,
  getFlag,
  mustBeArray,
  mustBeBoolean,
  mustBeFunction,
  mustBeInteger,
  mustBeRegExp,
  mustBeString,
  mustBeStringOrUint8Array,
  OptionKeys,
  pushLogFlags,
} from "./checker.ts";

export interface StreamIn {
  writeToStdin: (data: Uint8Array) => void;
  readFileSync?: (path: string, encoding: "utf8") => string;
  isSync: boolean;
  isBrowser: boolean;
}

export interface StreamOut {
  readFromStdout: (data: Uint8Array) => void;
  afterClose: () => void;
  service: StreamService;
}

export interface StreamFS {
  writeFile(contents: string, callback: (path: string | null) => void): void;
  readFile(
    path: string,
    callback: (err: Error | null, contents: string | null) => void,
  ): void;
}

export interface Refs {
  ref(): void;
  unref(): void;
}

export interface StreamService {
  buildOrServe(args: {
    callName: string;
    refs: Refs | null;
    serveOptions: ServeOptions | null;
    options: BuildOptions;
    isTTY: boolean;
    defaultWD: string;
    callback: (
      err: Error | null,
      res: BuildResult | ServeResult | null,
    ) => void;
  }): void;

  transform(args: {
    callName: string;
    refs: Refs | null;
    input: string;
    options: TransformOptions;
    isTTY: boolean;
    fs: StreamFS;
    callback: (err: Error | null, res: TransformResult | null) => void;
  }): void;

  formatMessages(args: {
    callName: string;
    refs: Refs | null;
    messages: PartialMessage[];
    options: FormatMessagesOptions;
    callback: (err: Error | null, res: string[] | null) => void;
  }): void;
}

// This can't use any promises in the main execution flow because it must work
// for both sync and async code. There is an exception for plugin code because
// that can't work in sync code anyway.
export function createChannel(streamIn: StreamIn): StreamOut {
  type PluginCallback = {
    (request: OnStartRequest): Promise<OnStartResponse>;
    (request: OnResolveRequest): Promise<OnResolveResponse>;
    (request: OnLoadRequest): Promise<OnLoadResponse>;
  };

  type WatchCallback = (error: Error | null, response: unknown) => void;

  interface ServeCallbacks {
    onRequest: ServeOptions["onRequest"];
    onWait: (error: string | null) => void;
  }

  const responseCallbacks = new Map<
    number,
    (error: string | null, response: Value) => void
  >();
  const pluginCallbacks = new Map<number, PluginCallback>();
  const watchCallbacks = new Map<number, WatchCallback>();
  const serveCallbacks = new Map<number, ServeCallbacks>();
  let nextServeID = 0;
  let isClosed = false;
  let nextRequestID = 0;
  let nextBuildKey = 0;

  // Use a long-lived buffer to store stdout data
  let stdout = new Uint8Array(16 * 1024);
  let stdoutUsed = 0;
  const readFromStdout = (chunk: Uint8Array) => {
    // Append the chunk to the stdout buffer, growing it as necessary
    const limit = stdoutUsed + chunk.length;
    if (limit > stdout.length) {
      const swap = new Uint8Array(limit * 2);
      swap.set(stdout);
      stdout = swap;
    }
    stdout.set(chunk, stdoutUsed);
    stdoutUsed += chunk.length;

    // Process all complete (i.e. not partial) packets
    let offset = 0;
    while (offset + 4 <= stdoutUsed) {
      const length = readUInt32LE(stdout, offset);
      if (offset + 4 + length > stdoutUsed) {
        break;
      }
      offset += 4;
      handleIncomingPacket(stdout.subarray(offset, offset + length));
      offset += length;
    }
    if (offset > 0) {
      stdout.copyWithin(0, offset, stdoutUsed);
      stdoutUsed -= offset;
    }
  };

  const afterClose = () => {
    // When the process is closed, fail all pending requests
    isClosed = true;
    for (const callback of responseCallbacks.values()) {
      callback("The service was stopped", null);
    }
    responseCallbacks.clear();
    for (const callbacks of serveCallbacks.values()) {
      callbacks.onWait("The service was stopped");
    }
    serveCallbacks.clear();
    for (const callback of watchCallbacks.values()) {
      try {
        callback(new Error("The service was stopped"), null);
      } catch (e) {
        console.error(e);
      }
    }
    watchCallbacks.clear();
  };

  const sendRequest = <Req>(
    refs: Refs | null,
    value: Req,
    callback: (error: string | null, response: Value) => void,
  ): void => {
    if (isClosed) return callback("The service is no longer running", null);
    const id = nextRequestID++;
    responseCallbacks.set(id, (error, response) => {
      try {
        callback(error, response);
      } finally {
        if (refs) refs.unref(); // Do this after the callback so the callback can extend the lifetime if needed
      }
    });
    if (refs) refs.ref();
    streamIn.writeToStdin(
      encodePacket({
        id,
        isRequest: true,
        value: value as unknown as Value,
      }),
    );
  };

  const sendResponse = (id: number, value: Value): void => {
    if (isClosed) throw new Error("The service is no longer running");
    streamIn.writeToStdin(
      encodePacket({ id, isRequest: false, value }),
    );
  };

  type RequestType =
    | PingRequest
    | OnStartRequest
    | OnResolveRequest
    | OnLoadRequest
    | OnRequestRequest
    | OnWaitRequest
    | OnWatchRebuildRequest;

  const handleRequest = async (id: number, request: RequestType) => {
    // Catch exceptions in the code below so they get passed to the caller
    try {
      switch (request.command) {
        case "ping": {
          sendResponse(id, {});
          break;
        }

        case "start": {
          const callback = pluginCallbacks.get(request.key);
          if (!callback) sendResponse(id, {});
          else {
            sendResponse(
              id,
              await callback!(request) as unknown as Value,
            );
          }
          break;
        }

        case "resolve": {
          const callback = pluginCallbacks.get(request.key);
          if (!callback) sendResponse(id, {});
          else {
            sendResponse(
              id,
              await callback!(request) as unknown as Value,
            );
          }
          break;
        }

        case "load": {
          const callback = pluginCallbacks.get(request.key);
          if (!callback) sendResponse(id, {});
          else {
            sendResponse(
              id,
              await callback!(request) as unknown as Value,
            );
          }
          break;
        }

        case "serve-request": {
          const callbacks = serveCallbacks.get(request.serveID);
          if (callbacks && callbacks.onRequest) {
            callbacks.onRequest(request.args);
          }
          sendResponse(id, {});
          break;
        }

        case "serve-wait": {
          const callbacks = serveCallbacks.get(request.serveID);
          if (callbacks) callbacks.onWait(request.error);
          sendResponse(id, {});
          break;
        }

        case "watch-rebuild": {
          const callback = watchCallbacks.get(request.watchID);
          try {
            if (callback) callback(null, request.args);
          } catch (err) {
            console.error(err);
          }
          sendResponse(id, {});
          break;
        }

        default:
          throw new Error(
            `Invalid command: ${
              (request as unknown as { command: string }).command
            }`,
          );
      }
    } catch (e) {
      sendResponse(
        id,
        {
          errors: [extractErrorMessageV8(e, streamIn, null, void 0, "")],
        } as unknown as Value,
      );
    }
  };

  let isFirstPacket = true;

  const handleIncomingPacket = (bytes: Uint8Array): void => {
    // The first packet is a version check
    if (isFirstPacket) {
      isFirstPacket = false;

      // Validate the binary's version number to make sure esbuild was installed
      // correctly. This check was added because some people have reported
      // errors that appear to indicate an incorrect installation.
      const binaryVersion = String.fromCharCode(...bytes);
      if (binaryVersion !== ESBUILD_VERSION) {
        throw new Error(
          `Cannot start service: Host version "${ESBUILD_VERSION}" does not match binary version ${
            JSON.stringify(binaryVersion)
          }`,
        );
      }
      return;
    }

    const packet = decodePacket(bytes);

    if (packet.isRequest) {
      handleRequest(packet.id, packet.value as unknown as RequestType);
    } else {
      const callback = responseCallbacks.get(packet.id)!;
      responseCallbacks.delete(packet.id);
      ensureObject(packet.value);
      if (packet.value.error) {
        ensureString(packet.value.error);
        callback(packet.value.error, {});
      } else callback(null, packet.value);
    }
  };

  type RunOnEndCallbacks = (
    result: BuildResult,
    logPluginError: LogPluginErrorCallback,
    done: () => void,
  ) => void;
  type LogPluginErrorCallback = (
    e: unknown,
    pluginName: string,
    note: Note | undefined,
    done: (message: Message) => void,
  ) => void;

  const handlePlugins = async (
    initialOptions: BuildOptions,
    plugins: Plugin[],
    buildKey: number,
    stash: ObjectStash,
  ): Promise<
    | {
      ok: true;
      requestPlugins: BuildPlugin[];
      runOnEndCallbacks: RunOnEndCallbacks;
      pluginRefs: Refs;
    }
    | { ok: false; error: unknown; pluginName: string }
  > => {
    const onStartCallbacks: {
      name: string;
      note: () => Note | undefined;
      callback: () => (
        | OnStartResult
        | null
        | void
        | Promise<OnStartResult | null | void>
      );
    }[] = [];

    const onEndCallbacks: {
      name: string;
      note: () => Note | undefined;
      callback: (result: BuildResult) => (void | Promise<void>);
    }[] = [];

    const onResolveCallbacks: {
      [id: number]: {
        name: string;
        note: () => Note | undefined;
        callback: (
          args: OnResolveArgs,
        ) => (
          | OnResolveResult
          | null
          | undefined
          | Promise<OnResolveResult | null | undefined>
        );
      };
    } = {};

    const onLoadCallbacks: {
      [id: number]: {
        name: string;
        note: () => Note | undefined;
        callback: (
          args: OnLoadArgs,
        ) => (
          | OnLoadResult
          | null
          | undefined
          | Promise<OnLoadResult | null | undefined>
        );
      };
    } = {};

    let nextCallbackID = 0;
    let i = 0;
    const requestPlugins: BuildPlugin[] = [];

    // Clone the plugin array to guard against mutation during iteration
    plugins = [...plugins];

    for (const item of plugins) {
      const keys: OptionKeys = {};
      if (typeof item !== "object") {
        throw new Error(`Plugin at index ${i} must be an object`);
      }
      const name = getFlag(item, keys, "name", mustBeString);
      if (typeof name !== "string" || name === "") {
        throw new Error(`Plugin at index ${i} is missing a name`);
      }
      try {
        const setup = getFlag(item, keys, "setup", mustBeFunction);
        if (typeof setup !== "function") {
          throw new Error(`Plugin is missing a setup function`);
        }
        checkForInvalidFlags(item, keys, `on plugin ${JSON.stringify(name)}`);

        const plugin: BuildPlugin = {
          name,
          onResolve: [],
          onLoad: [],
        };
        i++;

        const promise = setup({
          initialOptions,

          onStart(callback) {
            const registeredText =
              `This error came from the "onStart" callback registered here`;
            const registeredNote = extractCallerV8(
              new Error(registeredText),
              streamIn,
              "onStart",
            );
            onStartCallbacks.push({
              name: name!,
              callback,
              note: registeredNote,
            });
          },

          onEnd(callback) {
            const registeredText =
              `This error came from the "onEnd" callback registered here`;
            const registeredNote = extractCallerV8(
              new Error(registeredText),
              streamIn,
              "onEnd",
            );
            onEndCallbacks.push({
              name: name!,
              callback,
              note: registeredNote,
            });
          },

          onResolve(options, callback) {
            const registeredText =
              `This error came from the "onResolve" callback registered here`;
            const registeredNote = extractCallerV8(
              new Error(registeredText),
              streamIn,
              "onResolve",
            );
            const keys: OptionKeys = {};
            const filter = getFlag(options, keys, "filter", mustBeRegExp);
            const namespace = getFlag(options, keys, "namespace", mustBeString);
            checkForInvalidFlags(
              options,
              keys,
              `in onResolve() call for plugin ${JSON.stringify(name)}`,
            );
            if (filter == null) {
              throw new Error(`onResolve() call is missing a filter`);
            }
            const id = nextCallbackID++;
            onResolveCallbacks[id] = {
              name: name!,
              callback,
              note: registeredNote,
            };
            plugin.onResolve.push({
              id,
              filter: filter.source,
              namespace: namespace || "",
            });
          },

          onLoad(options, callback) {
            const registeredText =
              `This error came from the "onLoad" callback registered here`;
            const registeredNote = extractCallerV8(
              new Error(registeredText),
              streamIn,
              "onLoad",
            );
            const keys: OptionKeys = {};
            const filter = getFlag(options, keys, "filter", mustBeRegExp);
            const namespace = getFlag(options, keys, "namespace", mustBeString);
            checkForInvalidFlags(
              options,
              keys,
              `in onLoad() call for plugin ${JSON.stringify(name)}`,
            );
            if (filter == null) {
              throw new Error(`onLoad() call is missing a filter`);
            }
            const id = nextCallbackID++;
            onLoadCallbacks[id] = {
              name: name!,
              callback,
              note: registeredNote,
            };
            plugin.onLoad.push({
              id,
              filter: filter.source,
              namespace: namespace || "",
            });
          },
        });

        // Await a returned promise if there was one. This allows plugins to do
        // some asynchronous setup while still retaining the ability to modify
        // the build options. This deliberately serializes asynchronous plugin
        // setup instead of running them concurrently so that build option
        // modifications are easier to reason about.
        if (promise) await promise;

        requestPlugins.push(plugin);
      } catch (e) {
        return { ok: false, error: e, pluginName: name };
      }
    }

    const callback: PluginCallback = async (request) => {
      switch (request.command) {
        case "start": {
          const response: OnStartResponse = {
            errors: [],
            warnings: [],
          };
          await Promise.all(
            onStartCallbacks.map(async ({ name, callback, note }) => {
              try {
                const result = await callback();

                if (result != null) {
                  if (typeof result !== "object") {
                    throw new Error(
                      `Expected onStart() callback in plugin ${
                        JSON.stringify(name)
                      } to return an object`,
                    );
                  }
                  const keys: OptionKeys = {};
                  const errors = getFlag(result, keys, "errors", mustBeArray);
                  const warnings = getFlag(
                    result,
                    keys,
                    "warnings",
                    mustBeArray,
                  );
                  checkForInvalidFlags(
                    result,
                    keys,
                    `from onStart() callback in plugin ${JSON.stringify(name)}`,
                  );

                  if (errors != null) {
                    response.errors!.push(
                      ...sanitizeMessages(errors, "errors", stash, name),
                    );
                  }
                  if (warnings != null) {
                    response.warnings!.push(
                      ...sanitizeMessages(warnings, "warnings", stash, name),
                    );
                  }
                }
              } catch (e) {
                response.errors!.push(
                  extractErrorMessageV8(
                    e,
                    streamIn,
                    stash,
                    note && note(),
                    name,
                  ),
                );
              }
            }),
          );
          return response;
        }

        case "resolve": {
          const response: OnResolveResponse = {};
          let name = "",
            callback,
            note;
          for (const id of request.ids) {
            try {
              ({ name, callback, note } = onResolveCallbacks[id]);
              const result = await callback({
                path: request.path,
                importer: request.importer,
                namespace: request.namespace,
                resolveDir: request.resolveDir,
                kind: request.kind,
                pluginData: stash.load(request.pluginData),
              });

              if (result != null) {
                if (typeof result !== "object") {
                  throw new Error(
                    `Expected onResolve() callback in plugin ${
                      JSON.stringify(name)
                    } to return an object`,
                  );
                }
                const keys: OptionKeys = {};
                const pluginName = getFlag(
                  result,
                  keys,
                  "pluginName",
                  mustBeString,
                );
                const path = getFlag(result, keys, "path", mustBeString);
                const namespace = getFlag(
                  result,
                  keys,
                  "namespace",
                  mustBeString,
                );
                const external = getFlag(
                  result,
                  keys,
                  "external",
                  mustBeBoolean,
                );
                const sideEffects = getFlag(
                  result,
                  keys,
                  "sideEffects",
                  mustBeBoolean,
                );
                const pluginData = getFlag(
                  result,
                  keys,
                  "pluginData",
                  canBeAnything,
                );
                const errors = getFlag(result, keys, "errors", mustBeArray);
                const warnings = getFlag(result, keys, "warnings", mustBeArray);
                const watchFiles = getFlag(
                  result,
                  keys,
                  "watchFiles",
                  mustBeArray,
                );
                const watchDirs = getFlag(
                  result,
                  keys,
                  "watchDirs",
                  mustBeArray,
                );
                checkForInvalidFlags(
                  result,
                  keys,
                  `from onResolve() callback in plugin ${JSON.stringify(name)}`,
                );

                response.id = id;
                if (pluginName != null) response.pluginName = pluginName;
                if (path != null) response.path = path;
                if (namespace != null) response.namespace = namespace;
                if (external != null) response.external = external;
                if (sideEffects != null) response.sideEffects = sideEffects;
                if (pluginData != null) {
                  response.pluginData = stash.store(pluginData);
                }
                if (errors != null) {
                  response.errors = sanitizeMessages(
                    errors,
                    "errors",
                    stash,
                    name,
                  );
                }
                if (warnings != null) {
                  response.warnings = sanitizeMessages(
                    warnings,
                    "warnings",
                    stash,
                    name,
                  );
                }
                if (watchFiles != null) {
                  response.watchFiles = sanitizeStringArray(
                    watchFiles,
                    "watchFiles",
                  );
                }
                if (watchDirs != null) {
                  response.watchDirs = sanitizeStringArray(
                    watchDirs,
                    "watchDirs",
                  );
                }
                break;
              }
            } catch (e) {
              return {
                id,
                errors: [
                  extractErrorMessageV8(
                    e,
                    streamIn,
                    stash,
                    note && note(),
                    name,
                  ),
                ],
              };
            }
          }
          return response;
        }

        case "load": {
          const response: OnLoadResponse = {};
          let name = "",
            callback,
            note;
          for (const id of request.ids) {
            try {
              ({ name, callback, note } = onLoadCallbacks[id]);
              const result = await callback({
                path: request.path,
                namespace: request.namespace,
                pluginData: stash.load(request.pluginData),
              });

              if (result != null) {
                if (typeof result !== "object") {
                  throw new Error(
                    `Expected onLoad() callback in plugin ${
                      JSON.stringify(name)
                    } to return an object`,
                  );
                }
                const keys: OptionKeys = {};
                const pluginName = getFlag(
                  result,
                  keys,
                  "pluginName",
                  mustBeString,
                );
                const contents = getFlag(
                  result,
                  keys,
                  "contents",
                  mustBeStringOrUint8Array,
                );
                const resolveDir = getFlag(
                  result,
                  keys,
                  "resolveDir",
                  mustBeString,
                );
                const pluginData = getFlag(
                  result,
                  keys,
                  "pluginData",
                  canBeAnything,
                );
                const loader = getFlag(result, keys, "loader", mustBeString);
                const errors = getFlag(result, keys, "errors", mustBeArray);
                const warnings = getFlag(result, keys, "warnings", mustBeArray);
                const watchFiles = getFlag(
                  result,
                  keys,
                  "watchFiles",
                  mustBeArray,
                );
                const watchDirs = getFlag(
                  result,
                  keys,
                  "watchDirs",
                  mustBeArray,
                );
                checkForInvalidFlags(
                  result,
                  keys,
                  `from onLoad() callback in plugin ${JSON.stringify(name)}`,
                );

                response.id = id;
                if (pluginName != null) response.pluginName = pluginName;
                if (contents instanceof Uint8Array) {
                  response.contents = contents;
                } else if (contents != null) {
                  response.contents = encodeUTF8(contents);
                }
                if (resolveDir != null) response.resolveDir = resolveDir;
                if (pluginData != null) {
                  response.pluginData = stash.store(pluginData);
                }
                if (loader != null) response.loader = loader;
                if (errors != null) {
                  response.errors = sanitizeMessages(
                    errors,
                    "errors",
                    stash,
                    name,
                  );
                }
                if (warnings != null) {
                  response.warnings = sanitizeMessages(
                    warnings,
                    "warnings",
                    stash,
                    name,
                  );
                }
                if (watchFiles != null) {
                  response.watchFiles = sanitizeStringArray(
                    watchFiles,
                    "watchFiles",
                  );
                }
                if (watchDirs != null) {
                  response.watchDirs = sanitizeStringArray(
                    watchDirs,
                    "watchDirs",
                  );
                }
                break;
              }
            } catch (e) {
              return {
                id,
                errors: [
                  extractErrorMessageV8(
                    e,
                    streamIn,
                    stash,
                    note && note(),
                    name,
                  ),
                ],
              };
            }
          }
          return response;
        }

        default:
          throw new Error(
            `Invalid command: ${
              (request as unknown as { command: string }).command
            }`,
          );
      }
    };

    let runOnEndCallbacks: RunOnEndCallbacks = (
      _result,
      _logPluginError,
      done,
    ) => done();

    if (onEndCallbacks.length > 0) {
      runOnEndCallbacks = (result, logPluginError, done) => {
        (async () => {
          for (const { name, callback, note } of onEndCallbacks) {
            try {
              await callback(result);
            } catch (e) {
              result.errors.push(
                await new Promise<Message>((resolve) =>
                  logPluginError(e, name, note && note(), resolve)
                ),
              );
            }
          }
        })().then(done);
      };
    }

    let refCount = 0;
    return {
      ok: true,
      requestPlugins,
      runOnEndCallbacks,
      pluginRefs: {
        ref() {
          if (++refCount === 1) pluginCallbacks.set(buildKey, callback);
        },
        unref() {
          if (--refCount === 0) pluginCallbacks.delete(buildKey);
        },
      },
    };
  };

  interface ServeData {
    wait: Promise<void>;
    stop: () => void;
  }

  const buildServeData = (
    refs: Refs | null,
    options: ServeOptions,
    request: BuildRequest,
  ): ServeData => {
    const keys: OptionKeys = {};
    const port = getFlag(options, keys, "port", mustBeInteger);
    const host = getFlag(options, keys, "host", mustBeString);
    const servedir = getFlag(options, keys, "servedir", mustBeString);
    const onRequest = getFlag(options, keys, "onRequest", mustBeFunction);
    const serveID = nextServeID++;
    let onWait: ServeCallbacks["onWait"];
    const wait = new Promise<void>((resolve, reject) => {
      onWait = (error) => {
        serveCallbacks.delete(serveID);
        if (error !== null) reject(new Error(error));
        else resolve();
      };
    });
    request.serve = { serveID };
    checkForInvalidFlags(options, keys, `in serve() call`);
    if (port !== void 0) request.serve.port = port;
    if (host !== void 0) request.serve.host = host;
    if (servedir !== void 0) request.serve.servedir = servedir;
    serveCallbacks.set(serveID, {
      onRequest,
      onWait: onWait!,
    });
    return {
      wait,
      stop() {
        sendRequest<ServeStopRequest>(refs, {
          command: "serve-stop",
          serveID,
        }, () => {
          // We don't care about the result
        });
      },
    };
  };

  const buildLogLevelDefault = "warning";
  const transformLogLevelDefault = "silent";

  const buildOrServe: StreamService["buildOrServe"] = (args) => {
    const key = nextBuildKey++;
    const details = createObjectStash();
    let plugins: Plugin[] | undefined;
    const { refs, options, isTTY, callback } = args;
    if (typeof options === "object") {
      const value = options.plugins;
      if (value !== void 0) {
        if (!Array.isArray(value)) {
          throw new Error(`"plugins" must be an array`);
        }
        plugins = value;
      }
    }
    const logPluginError: LogPluginErrorCallback = (
      e,
      pluginName,
      note,
      done,
    ) => {
      const flags: string[] = [];
      try {
        pushLogFlags(flags, options, {}, isTTY, buildLogLevelDefault);
      } catch {}
      const message = extractErrorMessageV8(
        e,
        streamIn,
        details,
        note,
        pluginName,
      );
      sendRequest(refs, { command: "error", flags, error: message }, () => {
        ensureNumber(message.detail);
        message.detail = details.load(message.detail);
        done(message);
      });
    };
    const handleError = (e: any, pluginName: string) => {
      logPluginError(e, pluginName, void 0, (error) => {
        callback(failureErrorWithLog("Build failed", [error], []), null);
      });
    };
    if (plugins && plugins.length > 0) {
      if (streamIn.isSync) {
        return handleError(
          new Error("Cannot use plugins in synchronous API calls"),
          "",
        );
      }

      // Plugins can use async/await because they can't be run with "buildSync"
      handlePlugins(options, plugins, key, details).then(
        (result) => {
          if (!result.ok) {
            handleError(result.error, result.pluginName);
          } else {
            try {
              buildOrServeContinue({
                ...args,
                key,
                details,
                logPluginError,
                requestPlugins: result.requestPlugins,
                runOnEndCallbacks: result.runOnEndCallbacks,
                pluginRefs: result.pluginRefs,
              });
            } catch (e) {
              handleError(e, "");
            }
          }
        },
        (e) => handleError(e, ""),
      );
    } else {
      try {
        buildOrServeContinue({
          ...args,
          key,
          details,
          logPluginError,
          requestPlugins: null,
          runOnEndCallbacks: (result, logPluginError, done) => done(),
          pluginRefs: null,
        });
      } catch (e) {
        handleError(e, "");
      }
    }
  };

  // "buildOrServe" cannot be written using async/await due to "buildSync" and
  // must be written in continuation-passing style instead. Sorry about all of
  // the arguments, but these are passed explicitly instead of using another
  // nested closure because this function is already huge and I didn't want to
  // make it any bigger.
  const buildOrServeContinue = ({
    callName,
    refs: callerRefs,
    serveOptions,
    options,
    isTTY,
    defaultWD,
    callback,
    key,
    details,
    logPluginError,
    requestPlugins,
    runOnEndCallbacks,
    pluginRefs,
  }: {
    callName: string;
    refs: Refs | null;
    serveOptions: ServeOptions | null;
    options: BuildOptions;
    isTTY: boolean;
    defaultWD: string;
    callback: (
      err: Error | null,
      res: BuildResult | ServeResult | null,
    ) => void;
    key: number;
    details: ObjectStash;
    logPluginError: LogPluginErrorCallback;
    requestPlugins: BuildPlugin[] | null;
    runOnEndCallbacks: RunOnEndCallbacks;
    pluginRefs: Refs | null;
  }) => {
    const refs = {
      ref() {
        if (pluginRefs) pluginRefs.ref();
        if (callerRefs) callerRefs.ref();
      },
      unref() {
        if (pluginRefs) pluginRefs.unref();
        if (callerRefs) callerRefs.unref();
      },
    };
    const writeDefault = !streamIn.isBrowser;
    const {
      entries,
      flags,
      write,
      stdinContents,
      stdinResolveDir,
      absWorkingDir,
      incremental,
      nodePaths,
      watch,
    } = flagsForBuildOptions(
      callName,
      options,
      isTTY,
      buildLogLevelDefault,
      writeDefault,
    );
    const request: BuildRequest = {
      command: "build",
      key,
      entries,
      flags,
      write,
      stdinContents,
      stdinResolveDir,
      absWorkingDir: absWorkingDir || defaultWD,
      incremental,
      nodePaths,
    };
    if (requestPlugins) request.plugins = requestPlugins;
    const serve = serveOptions && buildServeData(refs, serveOptions, request);

    // Factor out response handling so it can be reused for rebuilds
    let rebuild: BuildResult["rebuild"] | undefined;
    let stop: BuildResult["stop"] | undefined;
    const copyResponseToResult = (
      response: BuildResponse,
      result: BuildResult,
    ) => {
      if (response.outputFiles) {
        result.outputFiles = response!.outputFiles.map(convertOutputFiles);
      }
      if (response.metafile) result.metafile = JSON.parse(response!.metafile);
      if (response.writeToStdout !== void 0) {
        console.log(
          decodeUTF8(response!.writeToStdout).replace(/\n$/, ""),
        );
      }
    };
    const buildResponseToResult = (
      response: BuildResponse | null,
      callback: (
        error: BuildFailure | null,
        result: BuildResult | null,
      ) => void,
    ): void => {
      const result: BuildResult = {
        errors: replaceDetailsInMessages(response!.errors, details),
        warnings: replaceDetailsInMessages(response!.warnings, details),
      };
      copyResponseToResult(response!, result);
      runOnEndCallbacks(result, logPluginError, () => {
        if (result.errors.length > 0) {
          return callback(
            failureErrorWithLog("Build failed", result.errors, result.warnings),
            null,
          );
        }

        // Handle incremental rebuilds
        if (response!.rebuildID !== void 0) {
          if (!rebuild) {
            let isDisposed = false;
            (rebuild as any) = () =>
              new Promise<BuildResult>((resolve, reject) => {
                if (isDisposed || isClosed) throw new Error("Cannot rebuild");
                sendRequest<RebuildRequest>(
                  refs,
                  { command: "rebuild", rebuildID: response!.rebuildID! },
                  (error2, response2) => {
                    if (error2) {
                      const message: Message = {
                        pluginName: "",
                        text: error2,
                        location: null,
                        notes: [],
                        detail: void 0,
                      };
                      return callback(
                        failureErrorWithLog("Build failed", [message], []),
                        null,
                      );
                    }
                    buildResponseToResult(response2, (error3, result3) => {
                      if (error3) reject(error3);
                      else resolve(result3!);
                    });
                  },
                );
              });
            refs.ref();
            rebuild!.dispose = () => {
              if (isDisposed) return;
              isDisposed = true;
              sendRequest<RebuildDisposeRequest, null>(refs, {
                command: "rebuild-dispose",
                rebuildID: response!.rebuildID!,
              }, () => {
                // We don't care about the result
              });
              refs.unref(); // Do this after the callback so "sendRequest" can extend the lifetime
            };
          }
          result.rebuild = rebuild;
        }

        // Handle watch mode
        if (response!.watchID !== void 0) {
          if (!stop) {
            let isStopped = false;
            refs.ref();
            stop = () => {
              if (isStopped) return;
              isStopped = true;
              watchCallbacks.delete(response!.watchID!);
              sendRequest<WatchStopRequest, null>(refs, {
                command: "watch-stop",
                watchID: response!.watchID!,
              }, () => {
                // We don't care about the result
              });
              refs.unref(); // Do this after the callback so "sendRequest" can extend the lifetime
            };
            if (watch) {
              watchCallbacks.set(
                response!.watchID,
                (serviceStopError, watchResponse) => {
                  if (serviceStopError) {
                    if (watch!.onRebuild) {
                      watch!.onRebuild(serviceStopError as any, null);
                    }
                    return;
                  }
                  const result2: BuildResult = {
                    errors: replaceDetailsInMessages(
                      watchResponse.errors,
                      details,
                    ),
                    warnings: replaceDetailsInMessages(
                      watchResponse.warnings,
                      details,
                    ),
                  };

                  // Note: "onEnd" callbacks should run even when there is no "onRebuild" callback
                  copyResponseToResult(watchResponse, result2);
                  runOnEndCallbacks(result2, logPluginError, () => {
                    if (result2.errors.length > 0) {
                      if (watch!.onRebuild) {
                        watch!.onRebuild(
                          failureErrorWithLog(
                            "Build failed",
                            result2.errors,
                            result2.warnings,
                          ),
                          null,
                        );
                      }
                      return;
                    }
                    if (watchResponse.rebuildID !== void 0) {
                      result2.rebuild = rebuild;
                    }
                    result2.stop = stop;
                    if (watch!.onRebuild) {
                      watch!.onRebuild(null, result2);
                    }
                  });
                },
              );
            }
          }
          result.stop = stop;
        }

        callback(null, result);
      });
    };

    if (write && streamIn.isBrowser) {
      throw new Error(`Cannot enable "write" in the browser`);
    }
    if (incremental && streamIn.isSync) {
      throw new Error(`Cannot use "incremental" with a synchronous build`);
    }
    if (watch && streamIn.isSync) {
      throw new Error(`Cannot use "watch" with a synchronous build`);
    }
    sendRequest<BuildRequest, BuildResponse>(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null);
        if (serve) {
          const serveResponse = response as any as ServeResponse;
          let isStopped = false;

          // Add a ref/unref for "stop()"
          refs.ref();
          const result: ServeResult = {
            port: serveResponse.port,
            host: serveResponse.host,
            wait: serve.wait,
            stop() {
              if (isStopped) return;
              isStopped = true;
              serve!.stop();
              refs.unref(); // Do this after the callback so "stop" can extend the lifetime
            },
          };

          // Add a ref/unref for "wait". This must be done independently of
          // "stop()" in case the response to "stop()" comes in first before
          // the request for "wait". Without this ref/unref, node may close
          // the child's stdin pipe after the "stop()" but before the "wait"
          // which will cause things to break. This caused a test failure.
          refs.ref();
          serve.wait.then(refs.unref, refs.unref);

          return callback(null, result);
        }
        return buildResponseToResult(response!, callback);
      },
    );
  };

  const transform: StreamService["transform"] = (
    { callName, refs, input, options, isTTY, fs, callback },
  ) => {
    const details = createObjectStash();

    // Ideally the "transform()" API would be faster than calling "build()"
    // since it doesn't need to touch the file system. However, performance
    // measurements with large files on macOS indicate that sending the data
    // over the stdio pipe can be 2x slower than just using a temporary file.
    //
    // This appears to be an OS limitation. Both the JavaScript and Go code
    // are using large buffers but the pipe only writes data in 8kb chunks.
    // An investigation seems to indicate that this number is hard-coded into
    // the OS source code. Presumably files are faster because the OS uses
    // a larger chunk size, or maybe even reads everything in one syscall.
    //
    // The cross-over size where this starts to be faster is around 1mb on
    // my machine. In that case, this code tries to use a temporary file if
    // possible but falls back to sending the data over the stdio pipe if
    // that doesn't work.
    let start = (inputPath: string | null) => {
      try {
        if (typeof input !== "string") {
          throw new Error('The input to "transform" must be a string');
        }
        const flags = flagsForTransformOptions(
          callName,
          options,
          isTTY,
          transformLogLevelDefault,
        );
        const request: TransformRequest = {
          command: "transform",
          flags,
          inputFS: inputPath !== null,
          input: inputPath !== null ? inputPath : input,
        };
        sendRequest<TransformRequest, TransformResponse>(
          refs,
          request,
          (error, response) => {
            if (error) return callback(new Error(error), null);
            const errors = replaceDetailsInMessages(response!.errors, details);
            const warnings = replaceDetailsInMessages(
              response!.warnings,
              details,
            );
            let outstanding = 1;
            const next = () =>
              --outstanding === 0 &&
              callback(null, {
                warnings,
                code: response!.code,
                map: response!.map,
              });
            if (errors.length > 0) {
              return callback(
                failureErrorWithLog("Transform failed", errors, warnings),
                null,
              );
            }

            // Read the JavaScript file from the file system
            if (response!.codeFS) {
              outstanding++;
              fs.readFile(response!.code, (err, contents) => {
                if (err !== null) {
                  callback(err, null);
                } else {
                  response!.code = contents!;
                  next();
                }
              });
            }

            // Read the source map file from the file system
            if (response!.mapFS) {
              outstanding++;
              fs.readFile(response!.map, (err, contents) => {
                if (err !== null) {
                  callback(err, null);
                } else {
                  response!.map = contents!;
                  next();
                }
              });
            }

            next();
          },
        );
      } catch (e) {
        const flags: string[] = [];
        try {
          pushLogFlags(flags, options, {}, isTTY, transformLogLevelDefault);
        } catch {}
        const error = extractErrorMessageV8(e, streamIn, details, void 0, "");
        sendRequest(refs, { command: "error", flags, error }, () => {
          ensureNumber(error.detail);
          error.detail = details.load(error.detail);
          callback(failureErrorWithLog("Transform failed", [error], []), null);
        });
      }
    };
    if (typeof input === "string" && input.length > 1024 * 1024) {
      const next = start;
      start = () => fs.writeFile(input, next);
    }
    start(null);
  };

  const formatMessages: StreamService["formatMessages"] = (
    { callName, refs, messages, options, callback },
  ) => {
    const result = sanitizeMessages(messages, "messages", null, "");
    if (!options) {
      throw new Error(`Missing second argument in ${callName}() call`);
    }
    const keys: OptionKeys = {};
    const kind = getFlag(options, keys, "kind", mustBeString);
    const color = getFlag(options, keys, "color", mustBeBoolean);
    const terminalWidth = getFlag(
      options,
      keys,
      "terminalWidth",
      mustBeInteger,
    );
    checkForInvalidFlags(options, keys, `in ${callName}() call`);
    if (kind === void 0) {
      throw new Error(`Missing "kind" in ${callName}() call`);
    }
    if (kind !== "error" && kind !== "warning") {
      throw new Error(
        `Expected "kind" to be "error" or "warning" in ${callName}() call`,
      );
    }
    const request: FormatMsgsRequest = {
      command: "format-msgs",
      messages: result,
      isWarning: kind === "warning",
    };
    if (color !== void 0) request.color = color;
    if (terminalWidth !== void 0) request.terminalWidth = terminalWidth;
    sendRequest<FormatMsgsRequest, FormatMsgsResponse>(
      refs,
      request,
      (error, response) => {
        if (error) return callback(new Error(error), null);
        callback(null, response!.messages);
      },
    );
  };

  return {
    readFromStdout,
    afterClose,
    service: {
      buildOrServe,
      transform,
      formatMessages,
    },
  };
}

// This stores JavaScript objects on the JavaScript side and temporarily
// substitutes them with an integer that can be passed through the Go side
// and back. That way we can associate JavaScript objects with Go objects
// even if the JavaScript objects aren't serializable. And we also avoid
// the overhead of serializing large JavaScript objects.
interface ObjectStash {
  load(id: number): any;
  store(value: any): number;
}

function createObjectStash(): ObjectStash {
  const map = new Map<number, any>();
  let nextID = 0;
  return {
    load(id) {
      return map.get(id);
    },
    store(value) {
      if (value === void 0) return -1;
      const id = nextID++;
      map.set(id, value);
      return id;
    },
  };
}

function extractCallerV8(
  e: Error,
  streamIn: StreamIn,
  ident: string,
): () => Note | undefined {
  let note: Note | undefined;
  let tried = false;
  return () => {
    if (tried) return note;
    tried = true;
    try {
      const lines = (e.stack + "").split("\n");
      lines.splice(1, 1);
      const location = parseStackLinesV8(streamIn, lines, ident);
      if (location) {
        note = { text: e.message, location };
        return note;
      }
    } catch {
    }
  };
}

function extractErrorMessageV8(
  e: any,
  streamIn: StreamIn,
  stash: ObjectStash | null,
  note: Note | undefined,
  pluginName: string,
): Message {
  let text = "Internal error";
  let location: Location | null = null;

  try {
    text = ((e && e.message) || e) + "";
  } catch {
  }

  // Optionally attempt to extract the file from the stack trace, works in V8/node
  try {
    location = parseStackLinesV8(streamIn, (e.stack + "").split("\n"), "");
  } catch {
  }

  return {
    pluginName,
    text,
    location,
    notes: note ? [note] : [],
    detail: stash ? stash.store(e) : -1,
  };
}

function parseStackLinesV8(
  streamIn: StreamIn,
  lines: string[],
  ident: string,
): Location | null {
  const at = "    at ";

  // Check to see if this looks like a V8 stack trace
  if (
    streamIn.readFileSync && !lines[0].startsWith(at) && lines[1].startsWith(at)
  ) {
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i];
      if (!line.startsWith(at)) continue;
      line = line.slice(at.length);
      while (true) {
        // Unwrap a function name
        let match = /^(?:new |async )?\S+ \((.*)\)$/.exec(line);
        if (match) {
          line = match[1];
          continue;
        }

        // Unwrap an eval wrapper
        match = /^eval at \S+ \((.*)\)(?:, \S+:\d+:\d+)?$/.exec(line);
        if (match) {
          line = match[1];
          continue;
        }

        // Match on the file location
        match = /^(\S+):(\d+):(\d+)$/.exec(line);
        if (match) {
          let contents;
          try {
            contents = streamIn.readFileSync(match[1], "utf8");
          } catch {
            break;
          }
          const lineText =
            contents.split(/\r\n|\r|\n|\u2028|\u2029/)[+match[2] - 1] || "";
          const column = +match[3] - 1;
          const length = lineText.slice(column, column + ident.length) === ident
            ? ident.length
            : 0;
          return {
            file: match[1],
            namespace: "file",
            line: +match[2],
            column: encodeUTF8(lineText.slice(0, column)).length,
            length: encodeUTF8(lineText.slice(column, column + length))
              .length,
            lineText: lineText + "\n" + lines.slice(1).join("\n"),
            suggestion: "",
          };
        }
        break;
      }
    }
  }

  return null;
}

function failureErrorWithLog(
  text: string,
  errors: Message[],
  warnings: Message[],
): BuildFailure {
  const limit = 5;
  const summary = errors.length < 1
    ? ""
    : ` with ${errors.length} error${errors.length < 2 ? "" : "s"}:` +
      errors.slice(0, limit + 1).map((e, i) => {
        if (i === limit) return "\n...";
        if (!e.location) return `\nerror: ${e.text}`;
        const { file, line, column } = e.location;
        const pluginText = e.pluginName ? `[plugin: ${e.pluginName}] ` : "";
        return `\n${file}:${line}:${column}: error: ${pluginText}${e.text}`;
      }).join("");
  const error: any = new Error(`${text}${summary}`);
  error.errors = errors;
  error.warnings = warnings;
  return error;
}

function replaceDetailsInMessages(
  messages: Message[],
  stash: ObjectStash,
): Message[] {
  for (const message of messages) {
    ensureNumber(message.detail);
    message.detail = stash.load(message.detail);
  }
  return messages;
}

function sanitizeLocation(
  location: PartialMessage["location"],
  where: string,
): Message["location"] {
  if (location == null) return null;

  const keys: OptionKeys = {};
  const file = getFlag(location, keys, "file", mustBeString);
  const namespace = getFlag(location, keys, "namespace", mustBeString);
  const line = getFlag(location, keys, "line", mustBeInteger);
  const column = getFlag(location, keys, "column", mustBeInteger);
  const length = getFlag(location, keys, "length", mustBeInteger);
  const lineText = getFlag(location, keys, "lineText", mustBeString);
  const suggestion = getFlag(location, keys, "suggestion", mustBeString);
  checkForInvalidFlags(location, keys, where);

  return {
    file: file || "",
    namespace: namespace || "",
    line: line || 0,
    column: column || 0,
    length: length || 0,
    lineText: lineText || "",
    suggestion: suggestion || "",
  };
}

function sanitizeMessages(
  messages: PartialMessage[],
  property: string,
  stash: ObjectStash | null,
  fallbackPluginName: string,
): Message[] {
  const messagesClone: Message[] = [];
  let index = 0;

  for (const message of messages) {
    const keys: OptionKeys = {};
    const pluginName = getFlag(message, keys, "pluginName", mustBeString);
    const text = getFlag(message, keys, "text", mustBeString);
    const location = getFlag(message, keys, "location", mustBeObjectOrNull);
    const notes = getFlag(message, keys, "notes", mustBeArray);
    const detail = getFlag(message, keys, "detail", canBeAnything);
    const where = `in element ${index} of "${property}"`;
    checkForInvalidFlags(message, keys, where);

    const notesClone: Note[] = [];
    if (notes) {
      for (const note of notes) {
        const noteKeys: OptionKeys = {};
        const noteText = getFlag(note, noteKeys, "text", mustBeString);
        const noteLocation = getFlag(
          note,
          noteKeys,
          "location",
          mustBeObjectOrNull,
        );
        checkForInvalidFlags(note, noteKeys, where);
        notesClone.push({
          text: noteText || "",
          location: sanitizeLocation(noteLocation, where),
        });
      }
    }

    messagesClone.push({
      pluginName: pluginName || fallbackPluginName,
      text: text || "",
      location: sanitizeLocation(location, where),
      notes: notesClone,
      detail: stash ? stash.store(detail) : -1,
    });
    index++;
  }

  return messagesClone;
}

function sanitizeStringArray(values: unknown[], property: string): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      throw new Error(
        `${JSON.stringify(property)} must be an array of strings`,
      );
    }
    result.push(value);
  }
  return result;
}

function convertOutputFiles(
  { path, contents }: BuildOutputFile,
): OutputFile {
  let text: string | null = null;
  return {
    path,
    contents,
    get text() {
      if (text === null) text = decodeUTF8(contents);
      return text;
    },
  };
}
