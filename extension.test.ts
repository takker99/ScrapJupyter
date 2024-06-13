import { extensionToLoader, isAvailableExtensions } from "./extension.ts";
import { assertEquals } from "./deps/testing.ts";

Deno.test("isAvailableExtensions()", async (t) => {
    await t.step(
        "isAvailableExtensions should return true for valid extensions",
        () => {
            for (
                const extension of [
                    "ts",
                    "js",
                    "tsx",
                    "jsx",
                    "mjs",
                    "javascript",
                    "typescript",
                ]
            ) {
                assertEquals(isAvailableExtensions(extension), true);
            }
        },
    );
});
Deno.test("isAvailableExtensions()", async (t) => {
    await t.step("should return 'js' for 'javascript'", () => {
        assertEquals(extensionToLoader("javascript"), "js");
    });

    await t.step("should return 'js' for 'js'", () => {
        assertEquals(extensionToLoader("js"), "js");
    });

    await t.step("should return 'js' for 'mjs'", () => {
        assertEquals(extensionToLoader("mjs"), "js");
    });

    await t.step("should return 'ts' for 'typescript'", () => {
        assertEquals(extensionToLoader("typescript"), "ts");
    });

    await t.step("should return 'ts' for 'ts'", () => {
        assertEquals(extensionToLoader("ts"), "ts");
    });

    await t.step("should return 'jsx' for 'jsx'", () => {
        assertEquals(extensionToLoader("jsx"), "jsx");
    });

    await t.step("should return 'tsx' for 'tsx'", () => {
        assertEquals(extensionToLoader("tsx"), "tsx");
    });
});