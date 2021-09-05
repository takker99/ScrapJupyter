import {
  BuildOptions,
  LogLevel,
  TransformOptions,
  WatchMode,
} from "./types.ts";
import { isBoolean, isString } from "../deps/unknownutil.ts";

function validateTarget(target: string): string {
  target += "";
  if (target.indexOf(",") >= 0) throw new Error(`Invalid target: ${target}`);
  return target;
}

export const canBeAnything = () => null;

export const mustBeBoolean = (value: boolean | undefined): string | null =>
  isBoolean(value) ? null : "a boolean";

export const mustBeBooleanOrObject = (
  value: unknown,
): string | null =>
  typeof value === "boolean" ||
    (typeof value === "object" && !Array.isArray(value))
    ? null
    : "a boolean or an object";

export const mustBeString = (value: string | undefined): string | null =>
  typeof value === "string" ? null : "a string";

export const mustBeRegExp = (value: RegExp | undefined): string | null =>
  value instanceof RegExp ? null : "a RegExp object";

export const mustBeInteger = (value: number | undefined): string | null =>
  typeof value === "number" && value === (value | 0) ? null : "an integer";

export const mustBeFunction = (value: unknown): string | null =>
  typeof value === "function" ? null : "a function";

export const mustBeArray = <T>(value: T[] | undefined): string | null =>
  Array.isArray(value) ? null : "an array";

export const mustBeObject = (value: unknown): string | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? null
    : "an object";

export const mustBeArrayOrRecord = <T extends string>(
  value: T[] | Record<T, T> | undefined,
): string | null =>
  typeof value === "object" && value !== null ? null : "an array or an object";

export const mustBeObjectOrNull = (
  value: unknown | null | undefined,
): string | null =>
  typeof value === "object" && !Array.isArray(value)
    ? null
    : "an object or null";

export const mustBeStringOrBoolean = (
  value: string | boolean | undefined,
): string | null =>
  typeof value === "string" || typeof value === "boolean"
    ? null
    : "a string or a boolean";

const mustBeStringOrObject = <T>(
  value: T,
): string | null =>
  typeof value === "string" ||
    typeof value === "object" && value !== null && !Array.isArray(value)
    ? null
    : "a string or an object";

const mustBeStringOrArray = (
  value: string | string[] | undefined,
): string | null =>
  typeof value === "string" || Array.isArray(value)
    ? null
    : "a string or an array";

export const mustBeStringOrUint8Array = (
  value: string | Uint8Array | undefined,
): string | null =>
  typeof value === "string" || value instanceof Uint8Array
    ? null
    : "a string or a Uint8Array";

export type OptionKeys = { [key: string]: boolean };

export function getFlag<T, K extends keyof T>(
  object: T,
  keys: OptionKeys,
  key: K,
  mustBeFn: (value: T[K]) => string | null,
): T[K] | undefined {
  const value = object[key];
  keys[key + ""] = true;
  if (value === undefined) return undefined;
  const mustBe = mustBeFn(value);
  if (mustBe !== null) throw new Error(`"${key}" must be ${mustBe}`);
  return value;
}

export function checkForInvalidFlags<T>(
  object: T,
  keys: OptionKeys,
  where: string,
): void {
  for (const key in object) {
    if (!(key in keys)) {
      throw new Error(`Invalid option ${where}: "${key}"`);
    }
  }
}

type CommonOptions = BuildOptions | TransformOptions;

export function pushLogFlags(
  flags: string[],
  options: CommonOptions,
  keys: OptionKeys,
  isTTY: boolean,
  logLevelDefault: LogLevel,
): void {
  const color = getFlag(options, keys, "color", mustBeBoolean);
  const logLevel = getFlag(options, keys, "logLevel", mustBeString);
  const logLimit = getFlag(options, keys, "logLimit", mustBeInteger);

  if (color !== void 0) flags.push(`--color=${color}`);
  else if (isTTY) flags.push(`--color=true`); // This is needed to fix "execFileSync" which buffers stderr
  flags.push(`--log-level=${logLevel || logLevelDefault}`);
  flags.push(`--log-limit=${logLimit || 0}`);
}

function pushCommonFlags(
  flags: string[],
  options: CommonOptions,
  keys: OptionKeys,
): void {
  const legalComments = getFlag(options, keys, "legalComments", mustBeString);
  const sourceRoot = getFlag(options, keys, "sourceRoot", mustBeString);
  const sourcesContent = getFlag(
    options,
    keys,
    "sourcesContent",
    mustBeBoolean,
  );
  const target = getFlag(options, keys, "target", mustBeStringOrArray);
  const format = getFlag(options, keys, "format", mustBeString);
  const globalName = getFlag(options, keys, "globalName", mustBeString);
  const minify = getFlag(options, keys, "minify", mustBeBoolean);
  const minifySyntax = getFlag(options, keys, "minifySyntax", mustBeBoolean);
  const minifyWhitespace = getFlag(
    options,
    keys,
    "minifyWhitespace",
    mustBeBoolean,
  );
  const minifyIdentifiers = getFlag(
    options,
    keys,
    "minifyIdentifiers",
    mustBeBoolean,
  );
  const charset = getFlag(options, keys, "charset", mustBeString);
  const treeShaking = getFlag(
    options,
    keys,
    "treeShaking",
    mustBeStringOrBoolean,
  );
  const jsx = getFlag(options, keys, "jsx", mustBeString);
  const jsxFactory = getFlag(options, keys, "jsxFactory", mustBeString);
  const jsxFragment = getFlag(options, keys, "jsxFragment", mustBeString);
  const define = getFlag(options, keys, "define", mustBeObject);
  const pure = getFlag(options, keys, "pure", mustBeArray);
  const keepNames = getFlag(options, keys, "keepNames", mustBeBoolean);

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
  if (treeShaking !== void 0 && treeShaking !== true) {
    flags.push(`--tree-shaking=${treeShaking}`);
  }

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

export function flagsForBuildOptions(
  callName: string,
  options: BuildOptions,
  isTTY: boolean,
  logLevelDefault: LogLevel,
  writeDefault: boolean,
): {
  entries: [string, string][];
  flags: string[];
  write: boolean;
  stdinContents: string | null;
  stdinResolveDir: string | null;
  absWorkingDir: string | undefined;
  incremental: boolean;
  nodePaths: string[];
  watch: WatchMode | null;
} {
  const flags: string[] = [];
  const entries: [string, string][] = [];
  const keys: OptionKeys = Object.create(null);
  let stdinContents: string | null = null;
  let stdinResolveDir: string | null = null;
  let watchMode: WatchMode | null = null;
  pushLogFlags(flags, options, keys, isTTY, logLevelDefault);
  pushCommonFlags(flags, options, keys);

  const sourcemap = getFlag(options, keys, "sourcemap", mustBeStringOrBoolean);
  const bundle = getFlag(options, keys, "bundle", mustBeBoolean);
  const watch = getFlag(options, keys, "watch", mustBeBooleanOrObject);
  const splitting = getFlag(options, keys, "splitting", mustBeBoolean);
  const preserveSymlinks = getFlag(
    options,
    keys,
    "preserveSymlinks",
    mustBeBoolean,
  );
  const metafile = getFlag(options, keys, "metafile", mustBeBoolean);
  const outfile = getFlag(options, keys, "outfile", mustBeString);
  const outdir = getFlag(options, keys, "outdir", mustBeString);
  const outbase = getFlag(options, keys, "outbase", mustBeString);
  const platform = getFlag(options, keys, "platform", mustBeString);
  const tsconfig = getFlag(options, keys, "tsconfig", mustBeString);
  const resolveExtensions = getFlag(
    options,
    keys,
    "resolveExtensions",
    mustBeArray,
  );
  const nodePathsInput = getFlag(options, keys, "nodePaths", mustBeArray);
  const mainFields = getFlag(options, keys, "mainFields", mustBeArray);
  const conditions = getFlag(options, keys, "conditions", mustBeArray);
  const external = getFlag(options, keys, "external", mustBeArray);
  const loader = getFlag(options, keys, "loader", mustBeObject);
  const outExtension = getFlag(options, keys, "outExtension", mustBeObject);
  const publicPath = getFlag(options, keys, "publicPath", mustBeString);
  const entryNames = getFlag(options, keys, "entryNames", mustBeString);
  const chunkNames = getFlag(options, keys, "chunkNames", mustBeString);
  const assetNames = getFlag(options, keys, "assetNames", mustBeString);
  const inject = getFlag(options, keys, "inject", mustBeArray);
  const banner = getFlag(options, keys, "banner", mustBeObject);
  const footer = getFlag(options, keys, "footer", mustBeObject);
  const entryPoints = getFlag(
    options,
    keys,
    "entryPoints",
    mustBeArrayOrRecord,
  );
  const absWorkingDir = getFlag(options, keys, "absWorkingDir", mustBeString);
  const stdin = getFlag(options, keys, "stdin", mustBeObject);
  const write = getFlag(options, keys, "write", mustBeBoolean) ?? writeDefault; // Default to true if not specified
  const allowOverwrite = getFlag(
    options,
    keys,
    "allowOverwrite",
    mustBeBoolean,
  );
  const incremental =
    getFlag(options, keys, "incremental", mustBeBoolean) === true;
  keys.plugins = true; // "plugins" has already been read earlier
  checkForInvalidFlags(options, keys, `in ${callName}() call`);

  if (sourcemap) {
    flags.push(`--sourcemap${sourcemap === true ? "" : `=${sourcemap}`}`);
  }
  if (bundle) flags.push("--bundle");
  if (allowOverwrite) flags.push("--allow-overwrite");
  if (watch) {
    flags.push("--watch");
    if (typeof watch === "boolean") {
      watchMode = {};
    } else {
      const watchKeys: OptionKeys = Object.create(null);
      const onRebuild = getFlag(watch, watchKeys, "onRebuild", mustBeFunction);
      checkForInvalidFlags(
        watch,
        watchKeys,
        `on "watch" in ${callName}() call`,
      );
      watchMode = { onRebuild };
    }
  }
  if (splitting) flags.push("--splitting");
  if (preserveSymlinks) flags.push("--preserve-symlinks");
  if (metafile) flags.push(`--metafile`);
  if (outfile) flags.push(`--outfile=${outfile}`);
  if (outdir) flags.push(`--outdir=${outdir}`);
  if (outbase) flags.push(`--outbase=${outbase}`);
  if (platform) flags.push(`--platform=${platform}`);
  if (tsconfig) flags.push(`--tsconfig=${tsconfig}`);
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

  if (entryPoints) {
    if (Array.isArray(entryPoints)) {
      for (const entryPoint of entryPoints) {
        entries.push(["", entryPoint + ""]);
      }
    } else {
      for (const [key, value] of Object.entries(entryPoints)) {
        entries.push([key + "", value + ""]);
      }
    }
  }

  if (stdin) {
    const stdinKeys: OptionKeys = Object.create(null);
    const contents = getFlag(stdin, stdinKeys, "contents", mustBeString);
    const resolveDir = getFlag(stdin, stdinKeys, "resolveDir", mustBeString);
    const sourcefile = getFlag(stdin, stdinKeys, "sourcefile", mustBeString);
    const loader = getFlag(stdin, stdinKeys, "loader", mustBeString);
    checkForInvalidFlags(stdin, stdinKeys, 'in "stdin" object');

    if (sourcefile) flags.push(`--sourcefile=${sourcefile}`);
    if (loader) flags.push(`--loader=${loader}`);
    if (resolveDir) stdinResolveDir = resolveDir + "";
    stdinContents = contents ? contents + "" : "";
  }

  const nodePaths: string[] = [];
  if (nodePathsInput) {
    for (let value of nodePathsInput) {
      value += "";
      nodePaths.push(value);
    }
  }

  return {
    entries,
    flags,
    write,
    stdinContents,
    stdinResolveDir,
    absWorkingDir,
    incremental,
    nodePaths,
    watch: watchMode,
  };
}

export function flagsForTransformOptions(
  callName: string,
  options: TransformOptions,
  isTTY: boolean,
  logLevelDefault: LogLevel,
): string[] {
  const flags: string[] = [];
  const keys: OptionKeys = Object.create(null);
  pushLogFlags(flags, options, keys, isTTY, logLevelDefault);
  pushCommonFlags(flags, options, keys);

  const sourcemap = getFlag(options, keys, "sourcemap", mustBeStringOrBoolean);
  const tsconfigRaw = getFlag(
    options,
    keys,
    "tsconfigRaw",
    mustBeStringOrObject,
  );
  const sourcefile = getFlag(options, keys, "sourcefile", mustBeString);
  const loader = getFlag(options, keys, "loader", mustBeString);
  const banner = getFlag(options, keys, "banner", mustBeString);
  const footer = getFlag(options, keys, "footer", mustBeString);
  checkForInvalidFlags(options, keys, `in ${callName}() call`);

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
