import { Scrapbox } from "./deps/scrapbox.ts";
import { encodeTitle } from "./utils.ts";
declare const scrapbox: Scrapbox;

type File = {
  filename?: string;
  dir: string;
  lang: string;
  /** コードブロックの開始行のid */ startIds: string[];
  lines: string[];
};

export function getCodeFiles() {
  const codeBlocks =
    scrapbox.Page.lines?.flatMap((line) => "codeBlock" in line ? [line] : []) ??
      [];
  return codeBlocks.reduce((acc: File[], { codeBlock, text, id }) => {
    const sameFileIndex = acc.findIndex(({ filename }) =>
      filename !== undefined && filename === codeBlock.filename
    );
    // code blockの先頭かつ新しいコードブロックのときのみ新しいfileを追加する
    if (codeBlock.start && sameFileIndex < 0) {
      return [...acc, {
        filename: codeBlock.filename,
        dir: `https://scrpabox.io/api/code/${scrapbox.Project.name}/${
          encodeTitle(scrapbox.Page.title ?? "")
        }`,
        lang: codeBlock.lang,
        startIds: [id],
        lines: [] as string[],
      }];
    }

    if (codeBlock.start) {
      acc.at(sameFileIndex)?.startIds?.push?.(id);
    } else {
      // 既存のコードブロックもしくは末尾のコードブロックに追記する
      acc.at(sameFileIndex)?.lines?.push?.(text);
    }

    return acc;
  }, []);
}
