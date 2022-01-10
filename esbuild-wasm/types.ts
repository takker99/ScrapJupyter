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
// This code is copied from https://raw.githubusercontent.com/evanw/esbuild/v0.12.25/lib/shared/types.ts and modified below:
// - $ deno fmt
// - load the worker code from URL instead of an embedded code
export type Platform = "browser" | "node" | "neutral";
export type Format = "iife" | "cjs" | "esm";
export type Loader =
  | "js"
  | "jsx"
  | "ts"
  | "tsx"
  | "css"
  | "json"
  | "text"
  | "base64"
  | "file"
  | "dataurl"
  | "binary"
  | "default";
export type LogLevel =
  | "verbose"
  | "debug"
  | "info"
  | "warning"
  | "error"
  | "silent";
export type Charset = "ascii" | "utf8";
export type TreeShaking = true | "ignore-annotations";

interface CommonOptions {
  sourcemap?: boolean | "inline" | "external" | "both";
  legalComments?: "none" | "inline" | "eof" | "linked" | "external";
  sourceRoot?: string;
  sourcesContent?: boolean;

  format?: Format;
  globalName?: string;
  target?: string | string[];

  minify?: boolean;
  minifyWhitespace?: boolean;
  minifyIdentifiers?: boolean;
  minifySyntax?: boolean;
  charset?: Charset;
  treeShaking?: TreeShaking;

  jsx?: "transform" | "preserve";
  jsxFactory?: string;
  jsxFragment?: string;

  define?: { [key: string]: string };
  pure?: string[];
  keepNames?: boolean;

  color?: boolean;
  logLevel?: LogLevel;
  logLimit?: number;
}

export interface BuildOptions extends CommonOptions {
  bundle?: boolean;
  splitting?: boolean;
  preserveSymlinks?: boolean;
  outfile?: string;
  metafile?: boolean;
  outdir?: string;
  outbase?: string;
  platform?: Platform;
  external?: string[];
  loader?: { [ext: string]: Loader };
  resolveExtensions?: string[];
  mainFields?: string[];
  conditions?: string[];
  write?: boolean;
  allowOverwrite?: boolean;
  tsconfig?: string;
  outExtension?: { [ext: string]: string };
  publicPath?: string;
  entryNames?: string;
  chunkNames?: string;
  assetNames?: string;
  inject?: string[];
  banner?: { [type: string]: string };
  footer?: { [type: string]: string };
  incremental?: boolean;
  entryPoints?: string[] | Record<string, string>;
  stdin?: StdinOptions;
  plugins?: Plugin[];
  absWorkingDir?: string;
  /** The "NODE_PATH" variable from Node.js */ nodePaths?: string[];
  watch?: boolean | WatchMode;
}

export interface WatchMode {
  onRebuild?: (error: BuildFailure | null, result: BuildResult | null) => void;
}

export interface StdinOptions {
  contents: string;
  resolveDir?: string;
  sourcefile?: string;
  loader?: Loader;
}

export interface Message {
  pluginName: string;
  text: string;
  location: Location | null;
  notes: Note[];

  /* Optional user-specified data that is passed through unmodified. You can
   * use this to stash the original error, for example.
   */
  detail: any;
}

export interface Note {
  text: string;
  location: Location | null;
}

export interface Location {
  file: string;
  namespace: string;
  /** 1-based */ line: number;
  /** 0-based, in bytes */ column: number;
  /** in bytes */ length: number;
  lineText: string;
  suggestion: string;
}

export interface OutputFile {
  path: string;
  /** "text" as bytes */ contents: Uint8Array;
  /** "contents" as text */ text: string;
}

export interface BuildInvalidate {
  (): Promise<BuildIncremental>;
  dispose(): void;
}

export interface BuildIncremental extends BuildResult {
  rebuild: BuildInvalidate;
}

export interface BuildResult {
  errors: Message[];
  warnings: Message[];
  /** Only when "write: false" */ outputFiles?: OutputFile[];
  /** Only when "incremental: true" */ rebuild?: BuildInvalidate;
  /** Only when "watch: true" */ stop?: () => void;
  /** Only when "metafile: true" */ metafile?: Metafile;
}

export interface BuildFailure extends Error {
  errors: Message[];
  warnings: Message[];
}

export interface ServeOptions {
  port?: number;
  host?: string;
  servedir?: string;
  onRequest?: (args: ServeOnRequestArgs) => void;
}

export interface ServeOnRequestArgs {
  remoteAddress: string;
  method: string;
  path: string;
  status: number;
  /** The time to generate the response, not to send it */ timeInMS: number;
}

export interface ServeResult {
  port: number;
  host: string;
  wait: Promise<void>;
  stop: () => void;
}

export interface TransformOptions extends CommonOptions {
  tsconfigRaw?: string | {
    compilerOptions?: {
      jsxFactory?: string;
      jsxFragmentFactory?: string;
      useDefineForClassFields?: boolean;
      importsNotUsedAsValues?: "remove" | "preserve" | "error";
    };
  };

  sourcefile?: string;
  loader?: Loader;
  banner?: string;
  footer?: string;
}

export interface TransformResult {
  code: string;
  map: string;
  warnings: Message[];
}

export interface TransformFailure extends Error {
  errors: Message[];
  warnings: Message[];
}

export interface Plugin {
  name: string;
  setup: (build: PluginBuild) => (void | Promise<void>);
}

export interface PluginBuild {
  initialOptions: BuildOptions;
  onStart(
    callback: () =>
      (OnStartResult | null | void | Promise<OnStartResult | null | void>),
  ): void;
  onEnd(callback: (result: BuildResult) => (void | Promise<void>)): void;
  onResolve(
    options: OnResolveOptions,
    callback: (
      args: OnResolveArgs,
    ) => (
      | OnResolveResult
      | null
      | undefined
      | Promise<OnResolveResult | null | undefined>
    ),
  ): void;
  onLoad(
    options: OnLoadOptions,
    callback: (
      args: OnLoadArgs,
    ) => (
      | OnLoadResult
      | null
      | undefined
      | Promise<OnLoadResult | null | undefined>
    ),
  ): void;
}

export interface OnStartResult {
  errors?: PartialMessage[];
  warnings?: PartialMessage[];
}

export interface OnResolveOptions {
  filter: RegExp;
  namespace?: string;
}

export interface OnResolveArgs {
  path: string;
  importer: string;
  namespace: string;
  resolveDir: string;
  kind: ImportKind;
  pluginData: any;
}

export type ImportKind =
  | "entry-point"
  // JS
  | "import-statement"
  | "require-call"
  | "dynamic-import"
  | "require-resolve"
  // CSS
  | "import-rule"
  | "url-token";

export interface OnResolveResult {
  pluginName?: string;

  errors?: PartialMessage[];
  warnings?: PartialMessage[];

  path?: string;
  external?: boolean;
  sideEffects?: boolean;
  namespace?: string;
  pluginData?: any;

  watchFiles?: string[];
  watchDirs?: string[];
}

export interface OnLoadOptions {
  filter: RegExp;
  namespace?: string;
}

export interface OnLoadArgs {
  path: string;
  namespace: string;
  pluginData: any;
}

export interface OnLoadResult {
  pluginName?: string;

  errors?: PartialMessage[];
  warnings?: PartialMessage[];

  contents?: string | Uint8Array;
  resolveDir?: string;
  loader?: Loader;
  pluginData?: any;

  watchFiles?: string[];
  watchDirs?: string[];
}

export interface PartialMessage {
  pluginName?: string;
  text?: string;
  location?: Partial<Location> | null;
  notes?: PartialNote[];
  detail?: any;
}

export interface PartialNote {
  text?: string;
  location?: Partial<Location> | null;
}

export interface Metafile {
  inputs: {
    [path: string]: {
      bytes: number;
      imports: {
        path: string;
        kind: ImportKind;
      }[];
    };
  };
  outputs: {
    [path: string]: {
      bytes: number;
      inputs: {
        [path: string]: {
          bytesInOutput: number;
        };
      };
      imports: {
        path: string;
        kind: ImportKind;
      }[];
      exports: string[];
      entryPoint?: string;
    };
  };
}

export interface FormatMessagesOptions {
  kind: "error" | "warning";
  color?: boolean;
  terminalWidth?: number;
}

/* This function invokes the "esbuild" command-line tool for you. It returns a
 * promise that either resolves with a "BuildResult" object or rejects with a
 * "BuildFailure" object.
 *
 * Works in node: yes
 * Works in browser: yes
 */
export declare function build(
  options: BuildOptions & { write: false },
): Promise<BuildResult & { outputFiles: OutputFile[] }>;
export declare function build(
  options: BuildOptions & { incremental: true },
): Promise<BuildIncremental>;
export declare function build(options: BuildOptions): Promise<BuildResult>;

/* This function is similar to "build" but it serves the resulting files over
 * HTTP on a localhost address with the specified port.
 *
 * Works in node: yes
 * Works in browser: no
 */
export declare function serve(
  serveOptions: ServeOptions,
  buildOptions: BuildOptions,
): Promise<ServeResult>;

/* This function transforms a single JavaScript file. It can be used to minify
 * JavaScript, convert TypeScript/JSX to JavaScript, or convert newer JavaScript
 * to older JavaScript. It returns a promise that is either resolved with a
 * "TransformResult" object or rejected with a "TransformFailure" object.
 *
 * Works in node: yes
 * Works in browser: yes
 */
export declare function transform(
  input: string,
  options?: TransformOptions,
): Promise<TransformResult>;

/* Converts log messages to formatted message strings suitable for printing in
 * the terminal. This allows you to reuse the built-in behavior of esbuild's
 * log message formatter. This is a batch-oriented API for efficiency.
 *
 * Works in node: yes
 * Works in browser: yes
 */
export declare function formatMessages(
  messages: PartialMessage[],
  options: FormatMessagesOptions,
): Promise<string[]>;

/* A synchronous version of "build".
 *
 * Works in node: yes
 * Works in browser: no
 */
export declare function buildSync(
  options: BuildOptions & { write: false },
): BuildResult & { outputFiles: OutputFile[] };
export declare function buildSync(options: BuildOptions): BuildResult;

/* A synchronous version of "transform".
 *
 * Works in node: yes
 * Works in browser: no
 */
export declare function transformSync(
  input: string,
  options?: TransformOptions,
): TransformResult;

/* A synchronous version of "formatMessages".
 *
 * Works in node: yes
 * Works in browser: no
 */
export declare function formatMessagesSync(
  messages: PartialMessage[],
  options: FormatMessagesOptions,
): string[];

/* This configures the browser-based version of esbuild. It is necessary to
 * call this first and wait for the returned promise to be resolved before
 * making other API calls when using esbuild in the browser.
 *
 * Works in browser: yes ("options" is required)
 */
export declare function initialize(options: InitializeOptions): Promise<void>;

export interface InitializeOptions {
  /* The URL of the "esbuild.wasm" file. This must be provided when running
   * esbuild in the browser.
   */
  wasmURL?: string;

  /* The URL of the "wasm_exec.js" file. This must be provided when running
   * esbuild in the browser.
   */
  workerURL?: string;

  /* By default esbuild runs the WebAssembly-based browser API in a web worker
   * to avoid blocking the UI thread. This can be disabled by setting "worker"
   * to false.
   */
  worker?: boolean;
}

export let version: string;
