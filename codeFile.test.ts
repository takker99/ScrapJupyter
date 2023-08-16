import { getCodeFiles } from "./codeFile.ts";
import { assertSnapshot } from "./deps/testing.ts";
import json from "./sample-page.json" assert { type: "json" };

Deno.test("getCodeFiles()", async (t) => {
  await assertSnapshot(t, getCodeFiles("villagepump", json.title, json.lines));
});
