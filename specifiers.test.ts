// based on https://github.com/lucacasonato/esbuild_deno_loader/blob/0.10.3/src/shared.ts
// Copyright 2021 Luca Casonato. All rights reserved. MIT license.

import { createErr, createOk, isOk } from "./deps/option-t.ts";
import { ALL } from "./deps/semver.ts";
import { assertEquals } from "./deps/testing.ts";
import { parseJsrSpecifier, parseNpmSpecifier } from "./specifiers.ts";

type NpmSpecifierTestCase = ReturnType<typeof parseNpmSpecifier> & {
  specifier: string;
};

const NPM_SPECIFIER: NpmSpecifierTestCase[] = [
  {
    specifier: "npm:package@1.2.3/test",
    ...createOk({
      name: "package",
      range: [[{
        build: [],
        major: 1,
        minor: 2,
        operator: undefined,
        patch: 3,
        prerelease: [],
      }]],
      tag: "1.2.3",
      entryPoint: "./test",
    }),
  },
  {
    specifier: "npm:package@1.2.3",
    ...createOk({
      name: "package",
      range: [[{
        build: [],
        major: 1,
        minor: 2,
        operator: undefined,
        patch: 3,
        prerelease: [],
      }]],
      tag: "1.2.3",
      entryPoint: ".",
    }),
  },
  {
    specifier: "npm:@package/test",
    ...createOk({
      name: "@package/test",
      range: [[ALL]],
      entryPoint: ".",
    }),
  },
  {
    specifier: "npm:@package/test@1",
    ...createOk({
      name: "@package/test",
      range: [[
        { major: 1, minor: 0, operator: ">=", patch: 0 },
        { major: 2, minor: 0, operator: "<", patch: 0 },
      ]],
      tag: "1",
      entryPoint: ".",
    }),
  },
  {
    specifier: "npm:@package/test@~1.1/sub_path",
    ...createOk({
      name: "@package/test",
      range: [[
        { major: 1, minor: 1, operator: ">=", patch: 0 },
        { major: 1, minor: 2, operator: "<", patch: 0 },
      ]],
      tag: "~1.1",
      entryPoint: "./sub_path",
    }),
  },
  {
    specifier: "npm:@package/test/sub_path",
    ...createOk({
      name: "@package/test",
      range: [[ALL]],
      entryPoint: "./sub_path",
    }),
  },
  {
    specifier: "npm:test",
    ...createOk({
      name: "test",
      range: [[ALL]],
      entryPoint: ".",
    }),
  },
  {
    specifier: "npm:test@^1.2",
    ...createOk({
      name: "test",
      range: [[
        { major: 1, minor: 2, operator: ">=", patch: 0 },
        { major: 2, minor: 0, operator: "<", patch: 0 },
      ]],
      tag: "^1.2",
      entryPoint: ".",
    }),
  },
  {
    specifier: "npm:test@~1.1/sub_path",
    ...createOk({
      name: "test",
      range: [[
        { major: 1, minor: 1, operator: ">=", patch: 0 },
        { major: 1, minor: 2, operator: "<", patch: 0 },
      ]],
      tag: "~1.1",
      entryPoint: "./sub_path",
    }),
  },
  {
    specifier: "npm:@package/test/sub_path",
    ...createOk({
      name: "@package/test",
      range: [[ALL]],
      entryPoint: "./sub_path",
    }),
  },
  {
    specifier: "npm:/@package/test/sub_path",
    ...createOk({
      name: "@package/test",
      range: [[ALL]],
      entryPoint: "./sub_path",
    }),
  },
  {
    specifier: "npm:/test",
    ...createOk({
      name: "test",
      range: [[ALL]],
      entryPoint: ".",
    }),
  },
  {
    specifier: "npm:/test/",
    ...createOk({
      name: "test",
      range: [[ALL]],
      entryPoint: ".",
    }),
  },
  {
    specifier: "jsr:@package/test",
    ...createErr({
      name: "NotNpmProtocolError",
      specifier: new URL("jsr:@package/test"),
    }),
  },
  {
    specifier: "npm:@package",
    ...createErr({
      name: "OnlyScopeProvidedError",
      specifier: new URL("npm:@package"),
    }),
  },
  {
    specifier: "npm:/",
    ...createErr({
      name: "PackageNotFoundError",
      specifier: new URL("npm:/"),
    }),
  },
  {
    specifier: "npm://test",
    ...createErr({
      name: "PackageNotFoundError",
      specifier: new URL("npm://test"),
    }),
  },
];

Deno.test("parseNpmSpecifier()", async (t) => {
  for (const { specifier, ...result } of NPM_SPECIFIER) {
    await t.step(
      `${isOk(result) ? "[valid]" : "[invalid]"} ${specifier}`,
      () => {
        assertEquals(parseNpmSpecifier(new URL(specifier)), result);
      },
    );
  }
});

type JsrSpecifierTestCase = ReturnType<typeof parseJsrSpecifier> & {
  specifier: string;
};

const JSR_SPECIFIER_VALID: JsrSpecifierTestCase[] = [
  {
    specifier: "jsr:@package/test",
    ...createOk({
      name: "@package/test",
      range: [[ALL]],
      entryPoint: ".",
    }),
  },
  {
    specifier: "jsr:@package/test@1",
    ...createOk({
      name: "@package/test",
      range: [[
        { major: 1, minor: 0, operator: ">=", patch: 0 },
        { major: 2, minor: 0, operator: "<", patch: 0 },
      ]],
      tag: "1",
      entryPoint: ".",
    }),
  },
  {
    specifier: "jsr:@package/test@~1.1/sub_path",
    ...createOk({
      name: "@package/test",
      range: [[
        { major: 1, minor: 1, operator: ">=", patch: 0 },
        { major: 1, minor: 2, operator: "<", patch: 0 },
      ]],
      tag: "~1.1",
      entryPoint: "./sub_path",
    }),
  },
  {
    specifier: "jsr:@package/test/sub_path",
    ...createOk({
      name: "@package/test",
      range: [[ALL]],
      entryPoint: "./sub_path",
    }),
  },
  {
    specifier: "npm:@package/test/sub_path",
    ...createErr({
      name: "NotJsrProtocolError",
      specifier: new URL("npm:@package/test/sub_path"),
    }),
  },
  {
    specifier: "jsr:@package",
    ...createErr({
      name: "PackageNotFoundError",
      specifier: new URL("jsr:@package"),
    }),
  },
  {
    specifier: "jsr:/",
    ...createErr({
      name: "ScopeNotFoundError",
      specifier: new URL("jsr:/"),
    }),
  },
  {
    specifier: "jsr://@package/name",
    ...createErr({
      name: "ScopeNotFoundError",
      specifier: new URL("jsr://@package/name"),
    }),
  },
  {
    specifier: "jsr:test",
    ...createErr({
      name: "ScopeNotFoundError",
      specifier: new URL("jsr:test"),
    }),
  },
  {
    specifier: "jsr:package/name",
    ...createErr({
      name: "ScopeNotFoundError",
      specifier: new URL("jsr:package/name"),
    }),
  },
];

Deno.test("parseJsrSpecifier()", async (t) => {
  for (const { specifier, ...result } of JSR_SPECIFIER_VALID) {
    await t.step(
      `${isOk(result) ? "[valid]" : "[invalid]"} ${specifier}`,
      () => {
        assertEquals(parseJsrSpecifier(new URL(specifier)), result);
      },
    );
  }
});
