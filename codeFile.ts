import { parseCodeTitle } from "./codeTitle.ts";
import { BaseLine, encodeTitleURI, parse } from "./deps/scrapbox-rest.ts";

interface File {
  path: string;
  lang: string;
  /** コードブロックの開始行のid */
  startIds: string[];
}

export const getCodeFiles = (
  project: string,
  title: string,
  lines: readonly BaseLine[],
): Iterable<File> => {
  if (lines.length === 0) return [];
  const input = lines.map((line) => line.text).join("\n");
  const blocks = parse(input, { hasTitle: true });

  /** 分割されたコードブロックを結合するのに使う */
  const codes = new Map<string, File>();
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
        const { fileName, lang } = parseCodeTitle(block.fileName);
        const prev = codes.get(fileName);
        codes.set(
          fileName,
          {
            path: prev?.path ??
              `https://scrapbox.io/api/code/${project}/${
                encodeTitleURI(title)
              }/${encodeTitleURI(fileName)}`,
            lang: prev?.lang ?? lang,
            startIds: [...(prev?.startIds ?? []), lines[counter].id],
          },
        );
        counter += block.content.split("\n").length + 1;
        break;
      }
    }
  }

  return codes.values();
};
