export interface ParseCodeTitleResult {
  fileName: string;
  lang: string;
}
export const parseCodeTitle = (title: string): ParseCodeTitleResult => {
  {
    const match = title.match(/^([^(]+)\(([^)]+)\)$/);
    if (match) return { fileName: match[1], lang: match[2] };
  }
  const lang = title.split(".").pop();
  return lang === undefined
    ? { fileName: title, lang: title }
    : { fileName: title, lang };
};
