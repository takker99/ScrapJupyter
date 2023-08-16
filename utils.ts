export const isBareModuleName = (name: string): boolean =>
  !/^(?:https?|file):\/\/|^\.{0,2}\//.test(name);
