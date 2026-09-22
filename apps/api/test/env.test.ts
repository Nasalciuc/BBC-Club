/** INTERNAL_API_SECRET_NEXT is declared and accepted on the same internal path as the primary. */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("INTERNAL_API_SECRET_NEXT", () => {
  it("accepts both primary and next secrets on an internal route", async () => {
    const next = `next_${"x".repeat(32)}`;
    const t = await testApp({
      suite: "env-next",
      env: { INTERNAL_API_SECRET_NEXT: next },
    });

    const primary = await t.app.request("/v1/internal/run/dispatch", {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(primary.status).toBe(200);

    const rotated = await t.app.request("/v1/internal/run/dispatch", {
      method: "POST",
      headers: { "X-Internal-Secret": next },
    });
    expect(rotated.status).toBe(200);

    await t.close();
  });

  it("rejects a wrong secret when _NEXT is unset", async () => {
    const t = await testApp({ suite: "env-primary-only" });
    const wrong = await t.app.request("/v1/internal/run/dispatch", {
      method: "POST",
      headers: { "X-Internal-Secret": `wrong_${"y".repeat(32)}` },
    });
    expect(wrong.status).toBe(401);

    const primary = await t.app.request("/v1/internal/run/dispatch", {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(primary.status).toBe(200);
    await t.close();
  });
});
