// @ts-nocheck - Deno types are not available in the browser

if (!self.Deno) {
  self.Deno = {
    build: { os: "linux" },
    errors: { AlreadyExists: Error },
    env: { get: () => undefined },
    permissions: { query: () => Promise.resolve("denied") },
    cwd: () => location.href,
  };
}
