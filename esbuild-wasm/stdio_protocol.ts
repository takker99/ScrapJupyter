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

// ported from https://github.com/evanw/esbuild/blob/v0.14.11/lib/shared/stdio_protocol.ts and modified
// Modified:
// - remove codes for node
// - remove type errors

// The JavaScript API communicates with the Go child process over stdin/stdout
// using this protocol. It's a very simple binary protocol that uses primitives
// and nested arrays and maps. It's basically JSON with UTF-8 encoding and an
// additional byte array primitive. You must send a response after receiving a
// request because the other end is blocking on the response coming back.

import type { ImportKind, Message, PartialMessage } from "./types.ts";

export interface BuildRequest {
  command: "build";
  key: number;
  entries: [string, string][]; // Use an array instead of a map to preserve order
  flags: string[];
  write: boolean;
  stdinContents: string | null;
  stdinResolveDir: string | null;
  absWorkingDir: string;
  incremental: boolean;
  nodePaths: string[];
  plugins?: BuildPlugin[];
  serve?: ServeRequest;
}

export interface ServeRequest {
  port?: number;
  host?: string;
  servedir?: string;
}

export interface ServeResponse {
  port: number;
  host: string;
}

export interface ServeStopRequest {
  command: "serve-stop";
  key: number;
}

export interface BuildPlugin {
  name: string;
  onResolve: { id: number; filter: string; namespace: string }[];
  onLoad: { id: number; filter: string; namespace: string }[];
}

export interface BuildResponse {
  errors: Message[];
  warnings: Message[];
  rebuild: boolean;
  outputFiles: BuildOutputFile[];
  metafile?: string;
  writeToStdout?: Uint8Array;
}

export interface BuildOutputFile {
  path: string;
  contents: Uint8Array;
}

export interface PingRequest {
  command: "ping";
}

export interface RebuildRequest {
  command: "rebuild";
  key: number;
}

export interface RebuildDisposeRequest {
  command: "rebuild-dispose";
  key: number;
}

export interface WatchStopRequest {
  command: "watch-stop";
  key: number;
}

export interface OnRequestRequest {
  command: "serve-request";
  key: number;
}

export interface TransformRequest {
  command: "transform";
  flags: string[];
  input: string;
  inputFS: boolean;
}

export interface TransformResponse {
  errors: Message[];
  warnings: Message[];

  code: string;
  codeFS: boolean;

  map: string;
  mapFS: boolean;
}

export interface FormatMsgsRequest {
  command: "format-msgs";
  messages: Message[];
  isWarning: boolean;
  color?: boolean;
  terminalWidth?: number;
}

export interface FormatMsgsResponse {
  messages: string[];
}

export interface AnalyzeMetafileRequest {
  command: "analyze-metafile";
  metafile: string;
  color?: boolean;
  verbose?: boolean;
}

export interface AnalyzeMetafileResponse {
  result: string;
}

export interface OnStartRequest {
  command: "on-start";
  key: number;
}

export interface OnStartResponse {
  errors?: PartialMessage[];
  warnings?: PartialMessage[];
}

export interface ResolveRequest {
  command: "resolve";
  key: number;
  path: string;
  pluginName: string;
  importer?: string;
  namespace?: string;
  resolveDir?: string;
  kind?: string;
  pluginData?: number;
}

export interface ResolveResponse {
  errors: Message[];
  warnings: Message[];

  path: string;
  external: boolean;
  sideEffects: boolean;
  namespace: string;
  suffix: string;
  pluginData: number;
}

export interface OnResolveRequest {
  command: "on-resolve";
  key: number;
  ids: number[];
  path: string;
  importer: string;
  namespace: string;
  resolveDir: string;
  kind: ImportKind;
  pluginData: number;
}

export interface OnResolveResponse {
  id?: number;
  pluginName?: string;

  errors?: PartialMessage[];
  warnings?: PartialMessage[];

  path?: string;
  external?: boolean;
  sideEffects?: boolean;
  namespace?: string;
  suffix?: string;
  pluginData?: number;

  watchFiles?: string[];
  watchDirs?: string[];
}

export interface OnLoadRequest {
  command: "on-load";
  key: number;
  ids: number[];
  path: string;
  namespace: string;
  suffix: string;
  pluginData: number;
}

export interface OnLoadResponse {
  id?: number;
  pluginName?: string;

  errors?: PartialMessage[];
  warnings?: PartialMessage[];

  contents?: Uint8Array;
  resolveDir?: string;
  loader?: string;
  pluginData?: number;

  watchFiles?: string[];
  watchDirs?: string[];
}

////////////////////////////////////////////////////////////////////////////////

export interface Packet<T> {
  id: number;
  isRequest: boolean;
  value: AsValue<T>;
}

export type Value =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | Value[]
  | { [key: string]: Value };
export type AsValue<T> = T extends null | boolean | number | string | Uint8Array
  ? T
  : T extends (infer U)[] ? U[]
  : { [K in keyof T]: K extends string ? AsValue<T[K]> : never };

export type RequestType =
  | PingRequest
  | OnResolveRequest
  | OnLoadRequest
  | OnStartRequest
  | OnRequestRequest;

export function encodePacket<T>(packet: Packet<T>): Uint8Array {
  const visit = <U>(value: AsValue<U>) => {
    if (value === null) {
      bb.write8(0);
    } else if (typeof value === "boolean") {
      bb.write8(1);
      bb.write8(+value);
    } else if (typeof value === "number") {
      bb.write8(2);
      bb.write32(value | 0);
    } else if (typeof value === "string") {
      bb.write8(3);
      bb.write(encodeUTF8(value));
    } else if (value instanceof Uint8Array) {
      bb.write8(4);
      bb.write(value);
    } else if (Array.isArray(value)) {
      bb.write8(5);
      bb.write32(value.length);
      for (const item of value) {
        visit(item);
      }
    } else {
      const keys = Object.keys(value);
      bb.write8(6);
      bb.write32(keys.length);
      for (const key in value) {
        bb.write(encodeUTF8(key));
        //@ts-ignore 型エラーを解決できない
        visit(value[key]);
      }
    }
  };

  const bb = new ByteBuffer();
  bb.write32(0); // Reserve space for the length
  bb.write32((packet.id << 1) | +!packet.isRequest);
  visit(packet.value);
  writeUInt32LE(bb.buf, bb.len - 4, 0); // Patch the length in
  return bb.buf.subarray(0, bb.len);
}

export function decodePacket(
  bytes: Uint8Array,
):
  & { id: number }
  & ({ isRequest: true; value: AsValue<RequestType> } | {
    isRequest: false;
    value: { error: string };
  }) {
  const visit = (): Value => {
    switch (bb.read8()) {
      case 0: // null
        return null;
      case 1: // boolean
        return !!bb.read8();
      case 2: // number
        return bb.read32();
      case 3: // string
        return decodeUTF8(bb.read());
      case 4: // Uint8Array
        return bb.read();
      case 5: { // Value[]
        const count = bb.read32();
        const value: Value[] = [];
        for (let i = 0; i < count; i++) {
          value.push(visit());
        }
        return value;
      }
      case 6: { // { [key: string]: Value }
        const count = bb.read32();
        const value: { [key: string]: Value } = {};
        for (let i = 0; i < count; i++) {
          value[decodeUTF8(bb.read())] = visit();
        }
        return value;
      }
      default:
        throw new Error("Invalid packet");
    }
  };

  const bb = new ByteBuffer(bytes);
  let id = bb.read32();
  const isRequest = (id & 1) === 0;
  id >>>= 1;
  if (bb.ptr !== bytes.length) {
    throw new Error("Invalid packet");
  }
  if (isRequest) {
    return { id, isRequest, value: (visit() as AsValue<RequestType>) };
  } else {
    return { id, isRequest, value: (visit() as { error: string }) };
  }
}

class ByteBuffer {
  len = 0;
  ptr = 0;

  constructor(public buf = new Uint8Array(1024)) {
  }

  private _write(delta: number): number {
    if (this.len + delta > this.buf.length) {
      const clone = new Uint8Array((this.len + delta) * 2);
      clone.set(this.buf);
      this.buf = clone;
    }
    this.len += delta;
    return this.len - delta;
  }

  write8(value: number): void {
    const offset = this._write(1);
    this.buf[offset] = value;
  }

  write32(value: number): void {
    const offset = this._write(4);
    writeUInt32LE(this.buf, value, offset);
  }

  write(bytes: Uint8Array): void {
    const offset = this._write(4 + bytes.length);
    writeUInt32LE(this.buf, bytes.length, offset);
    this.buf.set(bytes, offset + 4);
  }

  private _read(delta: number): number {
    if (this.ptr + delta > this.buf.length) {
      throw new Error("Invalid packet");
    }
    this.ptr += delta;
    return this.ptr - delta;
  }

  read8(): number {
    return this.buf[this._read(1)];
  }

  read32(): number {
    return readUInt32LE(this.buf, this._read(4));
  }

  read(): Uint8Array {
    const length = this.read32();
    const bytes = new Uint8Array(length);
    const ptr = this._read(bytes.length);
    bytes.set(this.buf.subarray(ptr, ptr + length));
    return bytes;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const encodeUTF8 = (text: string) => encoder.encode(text);
export const decodeUTF8 = (bytes: Uint8Array) => decoder.decode(bytes);

export function readUInt32LE(buffer: Uint8Array, offset: number): number {
  return buffer[offset++] |
    (buffer[offset++] << 8) |
    (buffer[offset++] << 16) |
    (buffer[offset++] << 24);
}

function writeUInt32LE(
  buffer: Uint8Array,
  value: number,
  offset: number,
): void {
  buffer[offset++] = value;
  buffer[offset++] = value >> 8;
  buffer[offset++] = value >> 16;
  buffer[offset++] = value >> 24;
}
