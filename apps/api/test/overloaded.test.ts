/** ADR-IMPL-080 (G2): while the process cannot trust its kill flags (the counters unread for longer than KILL_STALE_MS),
 *  a gated route answers 503 OVERLOADED with Retry-After — the module is not off; once Postgres answers, it runs again. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { KILL_STALE_MS } from "@bbc/platform";
import { testApp } from "./helpers/test-app";

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp({ suite: "overloaded" });
});
afterAll(() => t.close());

describe("flags that cannot be trusted (ADR-IMPL-080)", () => {
  it("answer OVERLOADED with Retry-After, not SERVICE_DISABLED, and the route runs again once they are read", async () => {
    const feed = () => t.app.request("/v1/proposals", { headers: { Cookie: t.memberA.cookie } });
    expect((await feed()).status).toBe(200);

    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = t.db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE platform.generations IN ACCESS EXCLUSIVE MODE`);
      locked.resolve();
      await release.promise;
    });
    try {
      await locked.promise;
      await Bun.sleep(KILL_STALE_MS + 1_000);
      const res = await feed();
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("5");
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("OVERLOADED");
    } finally {
      release.resolve();
      await held;
    }
    // The counters are asked at most once a second, Postgres answering or not: the next second's request runs.
    await Bun.sleep(1_100);
    expect((await feed()).status).toBe(200);
  }, 40_000);
});
