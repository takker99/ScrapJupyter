// ported from https://github.com/evanw/esbuild/blob/v0.14.11/lib/shared/common.ts and modified
/*! ported from https://github.com/evanw/esbuild/blob/v0.14.11/LICENSE.md
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
import {
  AnalyzeMetafileOptions,
  BuildFailure,
  BuildOptions,
  BuildResult,
  FormatMessagesOptions,
  Location,
  LogLevel,
  Message,
  Metafile,
  Note,
  OnLoadArgs,
  OnLoadResult,
  OnResolveArgs,
  OnResolveResult,
  OnStartResult,
  OutputFile,
  PartialMessage,
  Plugin,
  PluginBuild,
  ResolveOptions,
  ResolveResult,
  TransformOptions,
  TransformResult,
} from "./types.ts";
import {
  AnalyzeMetafileRequest,
  AnalyzeMetafileResponse,
  AsValue,
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
  OnResolveRequest,
  OnResolveResponse,
  OnStartRequest,
  OnStartResponse,
  readUInt32LE,
  RebuildDisposeRequest,
  RebuildRequest,
  RequestType,
  ResolveRequest,
  ResolveResponse,
  TransformRequest,
  TransformResponse,
  Value,
} from "./stdio_protocol.ts";
import { ESBUILD_VERSION } from "./version.ts";

function validateTarget(target: string): string {
  target += "";
  if (target.indexOf(",") >= 0) throw new Error(`Invalid target: ${target}`);
  return target;
}

function ensureNumber(value: unknown): asserts value is number {
  if (typeof value === "number") return;
  throw TypeError("the value must be number");
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type OptionKeys = { [key: string]: boolean };

type CommonOptions = BuildOptions | TransformOptions;
type Flag = `--${string}`;

function pushLogFlags(
  flags: Flag[],
  { color, logLevel, logLimit }: CommonOptions,
  isTTY: boolean,
  logLevelDefault: LogLevel,
): void {
  if (color !== void 0) flags.push(`--color=${color}`);
  else if (isTTY) flags.push(`--color=true`); // This is needed to fix "execFileSync" which buffers stderr
  flags.push(`--log-level=${logLevel || logLevelDefault}`);
  flags.push(`--log-limit=${logLimit || 0}`);
}

function pushCommonFlags(
  flags: Flag[],
  {
    legalComments,
    sourceRoot,
    sourcesContent,
    target,
    format,
    globalName,
    minify,
    minifySyntax,
    minifyWhitespace,
    minifyIdentifiers,
    drop,
    charset,
    treeShaking,
    ignoreAnnotations,
    jsx,
    jsxFactory,
    jsxFragment,
    define,
    pure,
    keepNames,
  }: CommonOptions,
): void {
  if (legalComments) flags.push(`--legal-comments=${legalComments}`);
  if (sourceRoot !== void 0) flags.push(`--source-root=${sourceRoot}`);
  if (sourcesContent !== void 0) {
    flags.push(`--sources-content=${sourcesContent}`);
  }
  if (target) {
    if (Array.isArray(target)) {
      flags.push(
        `--target=${Array.from(target).map(validateTarget).join(",")}`,
      );
    } else flags.push(`--target=${validateTarget(target)}`);
  }
  if (format) flags.push(`--format=${format}`);
  if (globalName) flags.push(`--global-name=${globalName}`);

  if (minify) flags.push("--minify");
  if (minifySyntax) flags.push("--minify-syntax");
  if (minifyWhitespace) flags.push("--minify-whitespace");
  if (minifyIdentifiers) flags.push("--minify-identifiers");
  if (charset) flags.push(`--charset=${charset}`);
  if (treeShaking !== void 0) flags.push(`--tree-shaking=${treeShaking}`);
  if (ignoreAnnotations) flags.push(`--ignore-annotations`);
  if (drop) for (const what of drop) flags.push(`--drop:${what}`);

  if (jsx) flags.push(`--jsx=${jsx}`);
  if (jsxFactory) flags.push(`--jsx-factory=${jsxFactory}`);
  if (jsxFragment) flags.push(`--jsx-fragment=${jsxFragment}`);

  if (define) {
    for (const key in define) {
      if (key.indexOf("=") >= 0) throw new Error(`Invalid define: ${key}`);
      flags.push(`--define:${key}=${define[key]}`);
    }
  }
  if (pure) for (const fn of pure) flags.push(`--pure:${fn}`);
  if (keepNames) flags.push(`--keep-names`);
}

function flagsForBuildOptions(
  options: BuildOptions,
  isTTY: boolean,
  logLevelDefault: LogLevel,
): {
  entries: [string, string][];
  flags: Flag[];
  write: boolean;
  stdinContents: string | null;
  stdinResolveDir: string | null;
  absWorkingDir: string | undefined;
  incremental: boolean;
  nodePaths: string[];
} {
  const flags: Flag[] = [];
  const entries: [string, string][] = [];
  const keys: OptionKeys = Object.create(null);
  let stdinContents: string | null = null;
  let stdinResolveDir: string | null = null;
  pushLogFlags(flags, options, isTTY, logLevelDefault);
  pushCommonFlags(flags, options);

  const {
    sourcemap,
    bundle,
    splitting,
    preserveSymlinks,
    metafile,
    outfile,
    outdir,
    outbase,
    platform,
    resolveExtensions,
    mainFields,
    conditions,
    external,
    loader,
    outExtension,
    publicPath,
    entryNames,
    chunkNames,
    assetNames,
    inject,
    banner,
    footer,
    absWorkingDir,
    stdin,
    incremental,
  } = options;
  keys.plugins = true; // "plugins" has already been read earlier

  if (sourcemap) {
    flags.push(`--sourcemap${sourcemap === true ? "" : `=${sourcemap}`}`);
  }
  if (bundle) flags.push("--bundle");
  if (splitting) flags.push("--splitting");
  if (preserveSymlinks) flags.push("--preserve-symlinks");
  if (metafile) flags.push(`--metafile`);
  if (outfile) flags.push(`--outfile=${outfile}`);
  if (outdir) flags.push(`--outdir=${outdir}`);
  if (outbase) flags.push(`--outbase=${outbase}`);
  if (platform) flags.push(`--platform=${platform}`);
  if (resolveExtensions) {
    const values: string[] = [];
    for (let value of resolveExtensions) {
      value += "";
      if (value.indexOf(",") >= 0) {
        throw new Error(`Invalid resolve extension: ${value}`);
      }
      values.push(value);
    }
    flags.push(`--resolve-extensions=${values.join(",")}`);
  }
  if (publicPath) flags.push(`--public-path=${publicPath}`);
  if (entryNames) flags.push(`--entry-names=${entryNames}`);
  if (chunkNames) flags.push(`--chunk-names=${chunkNames}`);
  if (assetNames) flags.push(`--asset-names=${assetNames}`);
  if (mainFields) {
    const values: string[] = [];
    for (let value of mainFields) {
      value += "";
      if (value.indexOf(",") >= 0) {
        throw new Error(`Invalid main field: ${value}`);
      }
      values.push(value);
    }
    flags.push(`--main-fields=${values.join(",")}`);
  }
  if (conditions) {
    const values: string[] = [];
    for (let value of conditions) {
      value += "";
      if (value.indexOf(",") >= 0) {
        throw new Error(`Invalid condition: ${value}`);
      }
      values.push(value);
    }
    flags.push(`--conditions=${values.join(",")}`);
  }
  if (external) for (const name of external) flags.push(`--external:${name}`);
  if (banner) {
    for (const type in banner) {
      if (type.indexOf("=") >= 0) {
        throw new Error(`Invalid banner file type: ${type}`);
      }
      flags.push(`--banner:${type}=${banner[type]}`);
    }
  }
  if (footer) {
    for (const type in footer) {
      if (type.indexOf("=") >= 0) {
        throw new Error(`Invalid footer file type: ${type}`);
      }
      flags.push(`--footer:${type}=${footer[type]}`);
    }
  }
  if (inject) for (const path of inject) flags.push(`--inject:${path}`);
  if (loader) {
    for (const ext in loader) {
      if (ext.indexOf("=") >= 0) {
        throw new Error(`Invalid loader extension: ${ext}`);
      }
      flags.push(`--loader:${ext}=${loader[ext]}`);
    }
  }
  if (outExtension) {
    for (const ext in outExtension) {
      if (ext.indexOf("=") >= 0) {
        throw new Error(`Invalid out extension: ${ext}`);
      }
      flags.push(`--out-extension:${ext}=${outExtension[ext]}`);
    }
  }

  if (stdin) {
    const { contents, resolveDir, sourcefile, loader } = stdin;

    if (sourcefile) flags.push(`--sourcefile=${sourcefile}`);
    if (loader) flags.push(`--loader=${loader}`);
    if (resolveDir) stdinResolveDir = resolveDir + "";
    stdinContents = contents ? contents + "" : "";
  }

  const nodePaths: string[] = [];

  return {
    entries,
    flags,
    write: false,
    stdinContents,
    stdinResolveDir,
    absWorkingDir,
    incremental: incremental === true,
    nodePaths,
  };
}

function flagsForTransformOptions(
  options: TransformOptions,
  isTTY: boolean,
  logLevelDefault: LogLevel,
): string[] {
  const flags: Flag[] = [];
  pushLogFlags(flags, options, isTTY, logLevelDefault);
  pushCommonFlags(flags, options);
  const { sourcemap, tsconfigRaw, sourcefile, loader, banner, footer } =
    options;

  if (sourcemap) {
    flags.push(`--sourcemap=${sourcemap === true ? "external" : sourcemap}`);
  }
  if (tsconfigRaw) {
    flags.push(
      `--tsconfig-raw=${
        typeof tsconfigRaw === "string"
          ? tsconfigRaw
          : JSON.stringify(tsconfigRaw)
      }`,
    );
  }
  if (sourcefile) flags.push(`--sourcefile=${sourcefile}`);
  if (loader) flags.push(`--loader=${loader}`);
  if (banner) flags.push(`--banner=${banner}`);
  if (footer) flags.push(`--footer=${footer}`);

  return flags;
}

export interface StreamIn {
  writeToStdin: (data: Uint8Array) => void;
  readFileSync?: (path: string, encoding: "utf8") => string;
  esbuild: PluginBuild["esbuild"];
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
    callback: (...args: [Error, null] | [null, string]) => void,
  ): void;
}

export interface Refs {
  ref(): void;
  unref(): void;
}

export interface StreamService {
  buildOrServe(args: {
    refs: Refs | null;
    options: BuildOptions;
    isTTY: boolean;
    defaultWD: string;
    callback: (...args: [Error, null] | [null, BuildResult]) => void;
  }): void;

  transform(args: {
    refs: Refs | null;
    input: string;
    options: TransformOptions;
    isTTY: boolean;
    fs: StreamFS;
    callback: (...args: [Error, null] | [null, TransformResult]) => void;
  }): void;

  formatMessages(args: {
    refs: Refs | null;
    messages: PartialMessage[];
    options: FormatMessagesOptions;
    callback: (...args: [Error, null] | [null, string[]]) => void;
  }): void;

  analyzeMetafile(args: {
    refs: Refs | null;
    metafile: string;
    options: AnalyzeMetafileOptions | undefined;
    callback: (...args: [Error, null] | [null, string]) => void;
  }): void;
}

// This can't use any promises in the main execution flow because it must work
// for both sync and async code. There is an exception for plugin code because
// that can't work in sync code anyway.
export function createChannel(streamIn: StreamIn): StreamOut {
  type PluginCallback = (
    request:
      | OnStartRequest
      | OnResolveRequest
      | OnLoadRequest,
  ) => Promise<
    | OnStartResponse
    | OnResolveResponse
    | OnLoadResponse
  >;

  const responseCallbacks = new Map<
    number,
    (error: string | null, response: Value) => void
  >();
  const pluginCallbacks = new Map<number, PluginCallback>();
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
  };

  type SendRequestMap = {
    resolve: [ResolveRequest, ResolveResponse];
    error: [{ command: "error"; flags: Flag[]; error: unknown }];
    rebuild: [RebuildRequest, BuildResponse];
    "rebuild-dispose": [RebuildDisposeRequest, null];
    build: [BuildRequest, BuildResponse];
    transform: [TransformRequest, TransformResponse];
    "format-message": [FormatMsgsRequest, FormatMsgsResponse];
    "analyze-metadata": [AnalyzeMetafileRequest, AnalyzeMetafileResponse];
  };

  const sendRequest = <K extends keyof SendRequestMap>(
    refs: Refs | null,
    value: AsValue<SendRequestMap[K][0]>,
    callback: (
      ...args: [string, null] | [null, AsValue<SendRequestMap[K][1]>]
    ) => void,
  ): void => {
    if (isClosed) return callback("The service is no longer running", null);
    const id = nextRequestID++;
    responseCallbacks.set(id, (error, response) => {
      try {
        //@ts-ignore 型の敗北
        callback(error, response);
      } finally {
        if (refs) refs.unref(); // Do this after the callback so the callback can extend the lifetime if needed
      }
    });
    if (refs) refs.ref();
    streamIn.writeToStdin(
      encodePacket({ id, isRequest: true, value }),
    );
  };

  const sendResponse = <T>(id: number, value: AsValue<T>): void => {
    if (isClosed) throw new Error("The service is no longer running");
    streamIn.writeToStdin(
      encodePacket({ id, isRequest: false, value }),
    );
  };

  const handleRequest = async (id: number, request: RequestType) => {
    // Catch exceptions in the code below so they get passed to the caller
    try {
      switch (request.command) {
        case "ping": {
          sendResponse(id, {});
          break;
        }

        case "on-start": {
          const callback = pluginCallbacks.get(request.key);
          if (!callback) sendResponse(id, {});
          else sendResponse(id, await callback(request));
          break;
        }

        case "on-resolve": {
          const callback = pluginCallbacks.get(request.key);
          if (!callback) sendResponse(id, {});
          else sendResponse(id, await callback!(request));
          break;
        }

        case "on-load": {
          const callback = pluginCallbacks.get(request.key);
          if (!callback) sendResponse(id, {});
          else sendResponse(id, await callback!(request));
          break;
        }

        default:
          throw new Error(`Invalid command: ${request.command}`);
      }
    } catch (e) {
      sendResponse(
        id,
        {
          errors: [extractErrorMessageV8(e, streamIn, null, void 0, "")],
        },
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
      handleRequest(packet.id, packet.value);
    } else {
      const callback = responseCallbacks.get(packet.id)!;
      responseCallbacks.delete(packet.id);
      if (packet.value.error) callback(packet.value.error, {});
      else callback(null, packet.value);
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
    refs: Refs | null,
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
    const requestPlugins: BuildPlugin[] = [];
    let isSetupDone = false;

    // Clone the plugin array to guard against mutation during iteration
    plugins = [...plugins];

    for (const { name, setup } of plugins) {
      try {
        const plugin: BuildPlugin = {
          name,
          onResolve: [],
          onLoad: [],
        };

        const resolve = (
          path: string,
          { pluginName, importer, namespace, kind, resolveDir, pluginData }:
            ResolveOptions = {},
        ): Promise<ResolveResult> => {
          if (!isSetupDone) {
            throw new Error(
              'Cannot call "resolve" before plugin setup has completed',
            );
          }

          return new Promise((resolve, reject) => {
            const request: ResolveRequest = {
              command: "resolve",
              path,
              key: buildKey,
              pluginName: name,
            };
            if (pluginName != null) request.pluginName = pluginName;
            if (importer != null) request.importer = importer;
            if (namespace != null) request.namespace = namespace;
            if (resolveDir != null) request.resolveDir = resolveDir;
            if (kind != null) request.kind = kind;
            if (pluginData != null) {
              request.pluginData = stash.store(pluginData);
            }

            sendRequest<"resolve">(
              refs,
              request,
              (error, response) => {
                if (error !== null) reject(new Error(error));
                else {
                  resolve({
                    errors: replaceDetailsInMessages(response!.errors, stash),
                    warnings: replaceDetailsInMessages(
                      response!.warnings,
                      stash,
                    ),
                    path: response!.path,
                    external: response!.external,
                    sideEffects: response!.sideEffects,
                    namespace: response!.namespace,
                    suffix: response!.suffix,
                    pluginData: stash.load(response!.pluginData),
                  });
                }
              },
            );
          });
        };

        const promise = setup({
          initialOptions,

          resolve,

          onStart(callback) {
            const registeredText =
              `This error came from the "onStart" callback registered here:`;
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
              `This error came from the "onEnd" callback registered here:`;
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

          onResolve({ filter, namespace }, callback) {
            const registeredText =
              `This error came from the "onResolve" callback registered here:`;
            const registeredNote = extractCallerV8(
              new Error(registeredText),
              streamIn,
              "onResolve",
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

          onLoad({ filter, namespace }, callback) {
            const registeredText =
              `This error came from the "onLoad" callback registered here:`;
            const registeredNote = extractCallerV8(
              new Error(registeredText),
              streamIn,
              "onLoad",
            );
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

          esbuild: streamIn.esbuild,
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
        case "on-start": {
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
                  const { errors, warnings } = result;

                  if (errors != null) {
                    response.errors!.push(
                      ...sanitizeMessages(errors, stash, name),
                    );
                  }
                  if (warnings != null) {
                    response.warnings!.push(
                      ...sanitizeMessages(warnings, stash, name),
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

        case "on-resolve": {
          const response: OnResolveResponse = {};
          let name = "";
          let note: (() => Note | undefined) | undefined;
          for (const id of request.ids) {
            try {
              const data = onResolveCallbacks[id];
              const callback = data.callback;
              name = data.name;
              note = data.note;
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
                const {
                  pluginName,
                  path,
                  suffix,
                  external,
                  sideEffects,
                  pluginData,
                  namespace,
                  watchDirs,
                  watchFiles,
                  errors,
                  warnings,
                } = result;
                response.id = id;
                if (pluginName != null) response.pluginName = pluginName;
                if (path != null) response.path = path;
                if (namespace != null) response.namespace = namespace;
                if (suffix != null) response.suffix = suffix;
                if (external != null) response.external = external;
                if (sideEffects != null) response.sideEffects = sideEffects;
                if (pluginData != null) {
                  response.pluginData = stash.store(pluginData);
                }
                if (errors != null) {
                  response.errors = sanitizeMessages(
                    errors,
                    stash,
                    name,
                  );
                }
                if (warnings != null) {
                  response.warnings = sanitizeMessages(
                    warnings,
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
                    note?.(),
                    name,
                  ),
                ],
              };
            }
          }
          return response;
        }

        case "on-load": {
          const response: OnLoadResponse = {};
          let name = "";
          let note: (() => Note | undefined) | undefined;
          for (const id of request.ids) {
            try {
              const data = onLoadCallbacks[id];
              name = data.name;
              const callback = data.callback;
              note = data.note;

              const result = await callback({
                path: request.path,
                namespace: request.namespace,
                suffix: request.suffix,
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

                const {
                  pluginName,
                  contents,
                  resolveDir,
                  pluginData,
                  loader,
                  errors,
                  warnings,
                  watchFiles,
                  watchDirs,
                } = result;
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
                    stash,
                    name,
                  );
                }
                if (warnings != null) {
                  response.warnings = sanitizeMessages(
                    warnings,
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
                  extractErrorMessageV8(e, streamIn, stash, note?.(), name),
                ],
              };
            }
          }
          return response;
        }
      }
    };

    let runOnEndCallbacks: RunOnEndCallbacks = (_, __, done) => done();

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
          done();
        })();
      };
    }

    isSetupDone = true;
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
      const flags: Flag[] = [];
      try {
        pushLogFlags(flags, options, isTTY, buildLogLevelDefault);
      } catch (_) {
        // nothing to do
      }
      const message = extractErrorMessageV8(
        e,
        streamIn,
        details,
        note,
        pluginName,
      );
      sendRequest<"error">(
        refs,
        { command: "error", flags, error: message },
        () => {
          ensureNumber(message.detail);
          message.detail = details.load(message.detail);
          done(message);
        },
      );
    };

    const handleError = (e: unknown, pluginName: string) => {
      logPluginError(e, pluginName, void 0, (error) => {
        callback(failureErrorWithLog("Build failed", [error], []), null);
      });
    };
    if (plugins && plugins.length > 0) {
      // Plugins can use async/await because they can't be run with "buildSync"
      handlePlugins(options, plugins, key, details, refs).then(
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
          runOnEndCallbacks: (_, _1, done) => done(),
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
  const buildOrServeContinue: {
    (args: {
      refs: Refs | null;
      options: BuildOptions;
      isTTY: boolean;
      defaultWD: string;
      callback: (...args: [Error, null] | [null, BuildResult]) => void;
      key: number;
      details: ObjectStash;
      logPluginError: LogPluginErrorCallback;
      requestPlugins: BuildPlugin[] | null;
      runOnEndCallbacks: RunOnEndCallbacks;
      pluginRefs: Refs | null;
    }): void;
  } = ({
    refs: callerRefs,
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
    const {
      entries,
      flags,
      write,
      stdinContents,
      stdinResolveDir,
      absWorkingDir,
      incremental,
      nodePaths,
    } = flagsForBuildOptions(
      options,
      isTTY,
      buildLogLevelDefault,
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

    // Factor out response handling so it can be reused for rebuilds
    let rebuild: BuildResult["rebuild"] | undefined;
    const copyResponseToResult = (
      response: BuildResponse,
      result: BuildResult,
    ) => {
      if (response.metafile) result.metafile = JSON.parse(response!.metafile);
      if (response.writeToStdout !== void 0) {
        console.log(
          decodeUTF8(response!.writeToStdout).replace(/\n$/, ""),
        );
      }
    };
    const buildResponseToResult = (
      response: BuildResponse,
      callback: (...args: [BuildFailure, null] | [null, BuildResult]) => void,
    ): void => {
      const result: BuildResult = {
        errors: replaceDetailsInMessages(response.errors, details),
        warnings: replaceDetailsInMessages(response.warnings, details),
        outputFiles: response.outputFiles.map(convertOutputFiles),
      };
      copyResponseToResult(response, result);
      runOnEndCallbacks(result, logPluginError, () => {
        if (result.errors.length > 0) {
          return callback(
            failureErrorWithLog("Build failed", result.errors, result.warnings),
            null,
          );
        }

        // Handle incremental rebuilds
        if (response.rebuild) {
          if (!rebuild) {
            let isDisposed = false;
            (rebuild as unknown) = () =>
              new Promise<BuildResult>((resolve, reject) => {
                if (isDisposed || isClosed) throw new Error("Cannot rebuild");
                sendRequest<"rebuild">(
                  refs,
                  { command: "rebuild", key },
                  (...args) => {
                    if (args[0] !== null) {
                      const message: Message = {
                        pluginName: "",
                        text: args[0],
                        location: null,
                        notes: [],
                        detail: void 0,
                      };
                      return callback(
                        failureErrorWithLog("Build failed", [message], []),
                        null,
                      );
                    }
                    buildResponseToResult(args[1], (error3, result3) => {
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
              sendRequest<"rebuild-dispose">(refs, {
                command: "rebuild-dispose",
                key,
              }, () => {
                // We don't care about the result
              });
              refs.unref(); // Do this after the callback so "sendRequest" can extend the lifetime
            };
          }
          result.rebuild = rebuild;
        }

        callback(null, result);
      });
    };

    sendRequest<"build">(
      refs,
      request,
      (...args) => {
        if (args[0] !== null) return callback(new Error(args[0]), null);
        return buildResponseToResult(args[1], callback);
      },
    );
  };

  const transform: StreamService["transform"] = (
    { refs, input, options, isTTY, fs, callback },
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
        sendRequest<"transform">(
          refs,
          request,
          (...args) => {
            if (args[0] !== null) return callback(new Error(args[0]), null);
            const response = args[1];
            const errors = replaceDetailsInMessages(response.errors, details);
            const warnings = replaceDetailsInMessages(
              response.warnings,
              details,
            );
            let outstanding = 1;
            const next = () =>
              --outstanding === 0 &&
              callback(null, {
                warnings,
                code: response.code,
                map: response.map,
              });
            if (errors.length > 0) {
              return callback(
                failureErrorWithLog("Transform failed", errors, warnings),
                null,
              );
            }

            // Read the JavaScript file from the file system
            if (response.codeFS) {
              outstanding++;
              fs.readFile(response.code, (err, contents) => {
                if (err !== null) {
                  callback(err, null);
                } else {
                  response.code = contents!;
                  next();
                }
              });
            }

            // Read the source map file from the file system
            if (response.mapFS) {
              outstanding++;
              fs.readFile(response.map, (err, contents) => {
                if (err !== null) {
                  callback(err, null);
                } else {
                  response.map = contents!;
                  next();
                }
              });
            }

            next();
          },
        );
      } catch (e) {
        const flags: Flag[] = [];
        try {
          pushLogFlags(flags, options, isTTY, transformLogLevelDefault);
        } catch (_) {
          // nothing to do
        }
        const error = extractErrorMessageV8(e, streamIn, details, void 0, "");
        sendRequest<"error">(refs, { command: "error", flags, error }, () => {
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
    { refs, messages, options, callback },
  ) => {
    const result = sanitizeMessages(messages, null, "");
    const { kind, color, terminalWidth } = options;
    const request: FormatMsgsRequest = {
      command: "format-msgs",
      messages: result,
      isWarning: kind === "warning",
    };
    if (color !== void 0) request.color = color;
    if (terminalWidth !== void 0) request.terminalWidth = terminalWidth;
    sendRequest<"format-message">(
      refs,
      request,
      (...args) => {
        if (args[0] !== null) return callback(new Error(args[0]), null);
        callback(null, args[1].messages);
      },
    );
  };

  const analyzeMetafile: StreamService["analyzeMetafile"] = (
    { refs, metafile, options, callback },
  ) => {
    if (options === void 0) options = {};
    const { color, verbose } = options;
    const request: AnalyzeMetafileRequest = {
      command: "analyze-metafile",
      metafile,
    };
    if (color !== void 0) request.color = color;
    if (verbose !== void 0) request.verbose = verbose;
    sendRequest<"analyze-metadata">(refs, request, (...args) => {
      if (args[0] !== null) return callback(new Error(args[0]), null);
      callback(null, args[1].result);
    });
  };

  return {
    readFromStdout,
    afterClose,
    service: {
      buildOrServe,
      transform,
      formatMessages,
      analyzeMetafile,
    },
  };
}

// This stores JavaScript objects on the JavaScript side and temporarily
// substitutes them with an integer that can be passed through the Go side
// and back. That way we can associate JavaScript objects with Go objects
// even if the JavaScript objects aren't serializable. And we also avoid
// the overhead of serializing large JavaScript objects.
interface ObjectStash {
  load(id: number): unknown;
  store(value: unknown): number;
}

function createObjectStash(): ObjectStash {
  const map = new Map<number, unknown>();
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
    } catch (_) {
      // nothing to do
    }
  };
}

function extractErrorMessageV8(
  e: unknown,
  streamIn: StreamIn,
  stash: ObjectStash | null,
  note: Note | undefined,
  pluginName: string,
): Message {
  let text = "Internal error";
  let location: Location | null = null;

  try {
    text = `${isObject(e) ? e.message ?? e : e}`;
  } catch (_) {
    // nothing to do
  }

  // Optionally attempt to extract the file from the stack trace, works in V8/node
  try {
    location = parseStackLinesV8(
      streamIn,
      `${isObject(e) && e.stack}`.split("\n"),
      "",
    );
  } catch (_) {
    // nothing to do
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
        return `\n${file}:${line}:${column}: ERROR: ${pluginText}${e.text}`;
      }).join("");
  const error = new Error(`${text}${summary}`) as BuildFailure;
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
): Message["location"] {
  if (location == null) return null;

  return {
    file: location.file || "",
    namespace: location.namespace || "",
    line: location.line || 0,
    column: location.column || 0,
    length: location.length || 0,
    lineText: location.lineText || "",
    suggestion: location.suggestion || "",
  };
}

function sanitizeMessages(
  messages: PartialMessage[],
  stash: ObjectStash | null,
  fallbackPluginName: string,
): Message[] {
  const messagesClone: Message[] = [];

  for (const message of messages) {
    const { pluginName, text, location, notes, detail } = message;

    const notesClone: Note[] = [];
    if (notes) {
      for (const { text, location } of notes) {
        notesClone.push({
          text: text || "",
          location: sanitizeLocation(location),
        });
      }
    }

    messagesClone.push({
      pluginName: pluginName || fallbackPluginName,
      text: text || "",
      location: sanitizeLocation(location),
      notes: notesClone,
      detail: stash ? stash.store(detail) : -1,
    });
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
