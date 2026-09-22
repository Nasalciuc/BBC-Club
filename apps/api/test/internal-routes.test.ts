/** Coverage for POST /v1/internal/run/:job (registered path literal for inventory). */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("POST /v1/internal/run/:job", () => {
  it("401 without secret; 200 with primary; 200 with _NEXT; 403 with member cookie", async () => {
    const next = `next_${"z".repeat(32)}`;
    const t = await testApp({
      suite: "internal-run",
      env: { INTERNAL_API_SECRET_NEXT: next },
    });

    expect((await t.app.request("/v1/internal/run/dispatch", { method: "POST" })).status).toBe(401);

    expect(
      (
        await t.app.request("/v1/internal/run/dispatch", {
          method: "POST",
          headers: { "X-Internal-Secret": t.internalSecret },
        })
      ).status,
    ).toBe(200);

    expect(
      (
        await t.app.request("/v1/internal/run/dispatch", {
          method: "POST",
          headers: { "X-Internal-Secret": next },
        })
      ).status,
    ).toBe(200);

    expect(
      (
        await t.app.request("/v1/internal/run/dispatch", {
          method: "POST",
          headers: { Cookie: t.memberA.cookie },
        })
      ).status,
    ).toBe(403);

    await t.close();
  });
});
