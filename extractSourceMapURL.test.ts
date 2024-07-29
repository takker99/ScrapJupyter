import { expectErr, expectOk } from "./deps/option-t.ts";
import { assertEquals } from "./deps/testing.ts";
import { extractSourceMapURL } from "./extractSourceMapURL.ts";

Deno.test("extractSourceMapURL()", async (t) => {
  const base = "https://example.com";
  await t.step("in single-line comment", () => {
    const code = `
    // Some code
    //# sourceMappingURL=example.map
  `;
    assertEquals(
      expectOk(extractSourceMapURL(code, base), "Source map URL not found"),
      { url: new URL("example.map", base), start: 43, end: 54 },
    );
  });

  await t.step("in /* comment", () => {
    const code = `
      Some code
      /*# sourceMappingURL=example.map */
  `;
    assertEquals(
      expectOk(extractSourceMapURL(code, base), "Source map URL not found"),
      { url: new URL("example.map", base), start: 44, end: 55 },
    );
  });

  await t.step("in unclosed multi-line comment", () => {
    const code = `
    /*
      Some code
      //# sourceMappingURL=example.map
  `;
    assertEquals(
      expectOk(extractSourceMapURL(code, base), "Source map URL not found"),
      { url: new URL("example.map", base), start: 51, end: 62 },
    );
  });

  await t.step("as trailing whitespace", () => {
    const code = `
    // Some code
    //# sourceMappingURL=example.map
  `;
    assertEquals(
      expectOk(extractSourceMapURL(code, base), "Source map URL not found"),
      { url: new URL("example.map", base), start: 43, end: 54 },
    );
  });

  await t.step("as code character", () => {
    const code = `
    // Some code
    //# sourceMappingURL=example.map
    const url = "https://example.com";
  `;
    assertEquals(
      expectOk(extractSourceMapURL(code, base), "Source map URL not found"),
      { url: new URL("example.map", base), start: 43, end: 54 },
    );
  });

  await t.step("not found", () => {
    assertEquals(
      expectErr(
        extractSourceMapURL(
          `
    // Some code
    const url = "https://example.com";
  `,
          base,
        ),
        "Source map URL found",
      ),
      {
        name: "NotFoundError",
        message: "Source map URL is not found",
      },
    );
  });

  assertEquals(
    expectErr(
      extractSourceMapURL(
        `
    // Some code
    const url = "https://example.com";
    /*# sourceMappingURL=example.map
  `,
        base,
      ),
      "Source map URL found",
    ),
    {
      name: "NotFoundError",
      message: "Source map URL is not found",
    },
  );
});
