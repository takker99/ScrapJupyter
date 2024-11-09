import "./deno-mock.js";
import { Plugin } from "./esbuild-wasm.ts";
import { denoResolverPlugin } from "jsr:@luca/esbuild-deno-loader@0.11";

// ported from https://deno.land/x/esbuild_deno_loader@0.9.0/src/plugin_deno_resolver.ts
export interface DenoResolverPluginOptions {
  /**
   * Specify the path to a deno.json config file to use. This is equivalent to
   * the `--config` flag to the Deno executable. This path must be absolute.
   */
  configPath?: string;
  /**
   * Specify a URL to an import map file to use when resolving import
   * specifiers. This is equivalent to the `--import-map` flag to the Deno
   * executable. This URL may be remote or a local file URL.
   *
   * If this option is not specified, the deno.json config file is consulted to
   * determine what import map to use, if any.
   */
  importMapURL?: string;
}

/**  {@link denoResolverPlugin} for browser */
export const resolver: (options?: DenoResolverPluginOptions) => Plugin =
  denoResolverPlugin as unknown as (
    options?: DenoResolverPluginOptions,
  ) => Plugin;
