import { describe, expect, it } from "bun:test";

import { createOnce } from "../../src/application/demand";

describe("createOnce", () => {
  it("ignores a sketch that already exists — the normal case after the day's first search", async () => {
    await expect(createOnce(Promise.reject(new Error("ERR TopK: key already exists")))).resolves.toBeUndefined();
    await expect(createOnce(Promise.reject(new Error("CMS: key already exists")))).resolves.toBeUndefined();
  });

  it("lets every other Redis error surface", async () => {
    await expect(createOnce(Promise.reject(new Error("ECONNREFUSED 127.0.0.1:6379")))).rejects.toThrow("ECONNREFUSED");
    await expect(createOnce(Promise.reject(new Error("OOM command not allowed")))).rejects.toThrow("OOM");
  });

  it("passes a successful create through", async () => {
    await expect(createOnce(Promise.resolve("OK"))).resolves.toBeUndefined();
  });
});
