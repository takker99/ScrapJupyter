export interface FileSystemNode {
  writeSync(fd: number, buffer: Uint8Array): number;
  read(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: null,
    callback: (err: Error | null, count?: number) => void,
  ): void;
}
declare global {
  const fs: FileSystemNode;
  class Go {
    constructor();
    public argv: string[];
    public run(instance: WebAssembly.Instance): Promise<void>;
    public importObject: WebAssembly.Imports;
  }
}
