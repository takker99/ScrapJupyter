/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// @deno-types=./wasm_exec.d.ts
import "https://raw.githubusercontent.com/golang/go/go1.17.5/misc/wasm/wasm_exec.js";
import { ESBUILD_VERSION } from "./version.ts";

// ported from esbuild-wasm@0.14.11 and modified
// LICENSE: https://github.com/evanw/esbuild/blob/v0.14.11/LICENSE.md
// This file is part of the web worker source code

globalThis.addEventListener(
  "message",
  async ({ data: wasm }: MessageEvent<BufferSource>) => {
    const decoder = new TextDecoder();

    let stderr = "";
    fs.writeSync = (fd, buffer) => {
      if (fd === 1) {
        postMessage(buffer);
      } else if (fd === 2) {
        stderr += decoder.decode(buffer);
        const parts = stderr.split("\n");
        if (parts.length > 1) console.log(parts.slice(0, -1).join("\n"));
        stderr = parts[parts.length - 1];
      } else {
        throw new Error("Bad write");
      }
      return buffer.length;
    };

    const stdin: Uint8Array[] = [];
    let resumeStdin: () => void;
    let stdinPos = 0;

    self.addEventListener("message", ({ data }: MessageEvent<Uint8Array>) => {
      if (data.length > 0) {
        stdin.push(data);
        resumeStdin?.();
      }
    });

    fs.read = (fd, buffer, offset, length, position, callback) => {
      if (
        fd !== 0 || offset !== 0 || length !== buffer.length ||
        position !== null
      ) {
        throw new Error("Bad read");
      }

      if (stdin.length === 0) {
        resumeStdin = () =>
          fs.read(fd, buffer, offset, length, position, callback);
        return;
      }

      const first = stdin[0];
      const count = Math.max(0, Math.min(length, first.length - stdinPos));
      buffer.set(first.subarray(stdinPos, stdinPos + count), offset);
      stdinPos += count;
      if (stdinPos === first.length) {
        stdin.shift();
        stdinPos = 0;
      }
      callback(null, count);
    };

    const go = new Go();
    go.argv = ["", `--service=${ESBUILD_VERSION}`];

    const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
    await go.run(instance);
  },
  { once: true },
);
