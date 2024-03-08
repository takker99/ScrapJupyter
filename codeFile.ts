import { BaseLine, encodeTitleURI, parse } from "./deps/scrapbox-rest.ts";

interface File {
  filename?: string;
  dir: string;
  lang: string;
  /** コードブロックの開始行のid */
  startIds: string[];
  lines: string[];
}

export const getCodeFiles = (
  project: string,
  title: string,
  lines: readonly BaseLine[],
): File[] => {
  if (lines.length === 0) return [];
  const input = lines.map((line) => line.text).join("\n");
  const blocks = parse(input, { hasTitle: true });

  /** 分割されたコードブロックを結合するのに使う */
  const codes = new Map<string, Omit<File, "filename">>();
  /** 現在読んでいる`pack.rows[0]`の行番号 */
  let counter = 0;
  for (const block of blocks) {
    switch (block.type) {
      case "title":
      case "line": {
        counter++;
        break;
      }
      case "table":
        counter += block.cells.length + 1;
        break;
      case "codeBlock": {
        const prev = codes.get(block.fileName);
        codes.set(
          block.fileName,
          {
            dir: prev?.dir ??
              `https://scrapbox.io/api/code/${project}/${
                encodeTitleURI(title)
              }`,
            lang: prev?.lang ?? block.fileName.split(".").pop() ?? "text",
            startIds: [...(prev?.startIds ?? []), lines[counter].id],
            lines: [...(prev?.lines ?? []), ...block.content.split("\n")],
          },
        );
        counter += block.content.split("\n").length + 1;
        break;
      }
    }
  }

  return [...codes.entries()].map(([filename, file]) => ({
    filename,
    ...file,
  }));
};
