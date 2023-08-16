import {
  BaseLine,
  convertToBlock,
  encodeTitleURI,
  packRows,
  parseToRows,
} from "./deps/scrapbox-rest.ts";

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
  const packs = packRows(parseToRows(input), { hasTitle: true });

  /** 分割されたコードブロックを結合するのに使う */
  const codes = new Map<string, Omit<File, "filename">>();
  /** 現在読んでいる`pack.rows[0]`の行番号 */
  let counter = 0;
  for (const pack of packs) {
    switch (pack.type) {
      case "title":
      case "table":
      case "line": {
        counter += pack.rows.length;
        break;
      }
      case "codeBlock": {
        const codeBlock = convertToBlock(pack);
        if (codeBlock.type !== "codeBlock") throw SyntaxError();
        const prev = codes.get(codeBlock.fileName);
        codes.set(
          codeBlock.fileName,
          {
            dir: prev?.dir ??
              `https://scrapbox.io/api/code/${project}/${
                encodeTitleURI(title)
              }`,
            lang: prev?.lang ?? codeBlock.fileName.split(".").pop() ?? "text",
            startIds: [...(prev?.startIds ?? []), lines[counter].id],
            lines: [...(prev?.lines ?? []), ...codeBlock.content.split("\n")],
          },
        );
        counter += pack.rows.length;
        break;
      }
    }
  }

  return [...codes.entries()].map(([filename, file]) => ({
    filename,
    ...file,
  }));
};
