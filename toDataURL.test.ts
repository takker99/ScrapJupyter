import { assertEquals } from "./deps/testing.ts";
import { toDataURL } from "./toDataURL.ts";

Deno.test("toDataURL()", async (t) => {
  await t.step(
    "should resolve with a data URL when given a valid Blob",
    async () => {
      const blob = new Blob(["Test data"], { type: "text/plain" });
      const result = await toDataURL(blob);
      assertEquals(result, "data:text/plain;base64,VGVzdCBkYXRh");
    },
  );
});
