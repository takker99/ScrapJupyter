import { assertEquals } from "./deps/testing.ts";
import { parseCodeTitle, ParseCodeTitleResult } from "./codeTitle.ts";

Deno.test("parseCodeTitle()", async (t) => {
  await t.step(
    "should return the correct result when given a title with parentheses",
    () => {
      const title = "example.ts(TypeScript)";
      const expected: ParseCodeTitleResult = {
        fileName: "example.ts",
        lang: "TypeScript",
      };
      assertEquals(parseCodeTitle(title), expected);
      assertEquals(parseCodeTitle("sample.tikz(tex)"), {
        fileName: "sample.tikz",
        lang: "tex",
      });
      assertEquals(parseCodeTitle("sample(tex)"), {
        fileName: "sample",
        lang: "tex",
      });
    },
  );

  await t.step(
    "should return the correct result when given a title without parentheses",
    () => {
      const title = "example.js";
      const expected: ParseCodeTitleResult = {
        fileName: "example.js",
        lang: "js",
      };
      assertEquals(parseCodeTitle(title), expected);
      assertEquals(parseCodeTitle("example.min.js"), {
        fileName: "example.min.js",
        lang: "js",
      });
    },
  );
  await t.step(
    "should return the correct result when given a title without an extension",
    () => {
      const title = "example";
      const expected: ParseCodeTitleResult = {
        fileName: "example",
        lang: "example",
      };
      assertEquals(parseCodeTitle(title), expected);
    },
  );
});
