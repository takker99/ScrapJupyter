export function isBareModuleName(name: string) {
  return !/^(?:https?|file):\/\/|^\.{0,2}\//.test(name);
}
