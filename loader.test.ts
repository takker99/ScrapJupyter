/// <reference lib="deno.ns" />

import { assertEquals } from "./deps/testing.ts";
import { responseToLoader } from "./loader.ts";

Deno.test("responseToLoader", async (t) => {
  await t.step(
    "should return 'text' for a response with an unknown extension",
    () => {
      const response = new Response("Test response");
      Object.defineProperty(response, "url", {
        value: "https://example.com/file.txt",
      });
      assertEquals(responseToLoader(response), "text");
    },
  );

  await t.step(
    "should return 'js' for a response with a valid extension",
    () => {
      const response = new Response("Test response", {
        headers: { "Content-Type": "application/javascript" },
      });
      Object.defineProperty(response, "url", {
        value: "https://example.com/script.js",
      });
      assertEquals(responseToLoader(response), "js");
    },
  );

  await t.step(
    "should return 'js' for a response with a valid extension",
    () => {
      const response = new Response("Test response", {
        headers: { "Content-Type": "application/javascript" },
      });
      Object.defineProperty(response, "url", {
        value: "https://example.com/index",
      });
      assertEquals(responseToLoader(response), "js");
    },
  );

  await t.step(
    "should return 'js' for a response with a valid extension",
    () => {
      const response = new Response("Test response");
      Object.defineProperty(response, "url", {
        value: "https://example.com/js",
      });
      assertEquals(responseToLoader(response), "js");
    },
  );

  await t.step(
    "should return 'js' for a response with an 'mjs' extension",
    () => {
      const response = new Response("Test response", {
        headers: { "Content-Type": "text/plain" },
      });
      Object.defineProperty(response, "url", {
        value: "https://example.com/script.mjs",
      });
      assertEquals(responseToLoader(response), "js");
    },
  );

  await t.step(
    "should return the correct loader for a given response with a valid MIME type",
    () => {
      const response = new Response("Test response", {
        headers: { "Content-Type": "text/css" },
      });
      Object.defineProperty(response, "url", {
        value: "https://example.com/style.css",
      });
      assertEquals(responseToLoader(response), "css");
    },
  );

  await t.step(
    "should return 'text' for a response with an unknown MIME type",
    () => {
      const response = new Response("Test response", {
        headers: { "Content-Type": "application/octet-stream" },
      });
      Object.defineProperty(response, "url", {
        value: "https://example.com/file.bin",
      });
      assertEquals(responseToLoader(response), "text");
    },
  );
});
