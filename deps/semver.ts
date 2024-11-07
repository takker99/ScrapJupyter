export * from "jsr:@std/semver@1";
import type { Comparator } from "jsr:@std/semver@1";

// ported from https://jsr.io/@std/semver/1.0.3/_constants.ts
/**
 * A comparator which will span all valid semantic versions
 */
export const ALL: Comparator = {
  operator: undefined,
  major: Number.NaN,
  minor: Number.NaN,
  patch: Number.NaN,
  prerelease: [],
  build: [],
};
