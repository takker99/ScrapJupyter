export const toLc = (title: string) =>
  title.toLowerCase().replaceAll(" ", "_").replace(
    /[/?#\{}^|<>]/g,
    (char) => encodeURIComponent(char),
  );
export function encodeTitle(title: string) {
  return title.replaceAll(" ", "_").replace(
    /[/?#\{}^|<>]/g,
    (char) => encodeURIComponent(char),
  );
}
export function isBareModuleName(name: string) {
  return !/^(?:https?|file):\/\/|^\.{0,2}\//.test(name);
}
