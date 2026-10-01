/** GET /v1/internal/demand (ops:read) and the demand-rollup job. */
import { describe, expect, it } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("GET /v1/internal/demand", () => {
  it("requires the internal secret and returns routes with no fares first", async () => {
    const t = await testApp({ suite: "demand" });
    expect((await t.app.request("/v1/internal/demand")).status).toBe(401);
    expect(
      (
        await t.app.request("/v1/internal/demand", {
          headers: { Cookie: t.memberA.cookie },
        })
      ).status,
    ).toBe(403);

    const ok = await t.app.request("/v1/internal/demand?days=7", {
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { days: number; routes: unknown[] };
    expect(body.days).toBe(7);
    expect(Array.isArray(body.routes)).toBe(true);

    const bad = await t.app.request("/v1/internal/demand?days=0", {
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(bad.status).toBe(400);

    const job = await t.app.request("/v1/internal/run/demand-rollup", {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(job.status).toBe(200);
    await t.close();
  });
});
