import { test, expect, beforeAll, afterAll } from "bun:test";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { gcraCheck } from "../src/ratelimit/pg-store";
import { createRateLimiter } from "../src/ratelimit";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("platform-ratelimit-pg", { max: 20 });
});
afterAll(() => iso.drop());

test("50 concurrent requests, burst 5 → exactly 5 allowed (atomic)", async () => {
  const now = Date.now();
  const r = await Promise.all(
    Array.from({ length: 50 }, () => gcraCheck(iso.db, "requests:member:A", 10, 3_600_000, 5, now)),
  );
  expect(r.filter((x) => x.allowed).length).toBe(5);
});

test("after the burst, one more every period/limit; retry-after says when", async () => {
  const t0 = 1_800_000_000_000;
  for (let i = 0; i < 5; i++) expect((await gcraCheck(iso.db, "k:B", 10, 3_600_000, 5, t0)).allowed).toBe(true);
  const denied = await gcraCheck(iso.db, "k:B", 10, 3_600_000, 5, t0);
  expect(denied.allowed).toBe(false);
  expect(denied.retryAfterMs).toBe(360_000);
  expect((await gcraCheck(iso.db, "k:B", 10, 3_600_000, 5, t0 + 360_000)).allowed).toBe(true);
  expect((await gcraCheck(iso.db, "k:B", 10, 3_600_000, 5, t0 + 360_001)).allowed).toBe(false);
});

test("checked inside the caller's transaction: a unit is spent only if that transaction commits", async () => {
  const limiter = createRateLimiter({ db: iso.db, flags: { read: async () => null } });
  const key = `m:tx-${crypto.randomUUID()}`;
  const rolledBack = new Error("rolled back");
  // requests.submit: burst 5. Five checks in a transaction that rolls back leave the bucket as it was.
  await expect(
    iso.db.transaction(async (tx) => {
      for (let i = 0; i < 5; i++) expect((await limiter.check("requests.submit", key, tx)).allowed).toBe(true);
      throw rolledBack;
    }),
  ).rejects.toBe(rolledBack);
  for (let i = 0; i < 5; i++) expect((await limiter.check("requests.submit", key)).allowed).toBe(true);
  expect((await limiter.check("requests.submit", key)).allowed).toBe(false);
});

test("no boundary effect: 10 at :59 and 10 at :01 is not 20", async () => {
  const t = 1_800_003_540_000;
  let ok = 0;
  for (let i = 0; i < 10; i++) if ((await gcraCheck(iso.db, "k:C", 10, 3_600_000, 5, t)).allowed) ok++;
  for (let i = 0; i < 10; i++) if ((await gcraCheck(iso.db, "k:C", 10, 3_600_000, 5, t + 120_000)).allowed) ok++;
  expect(ok).toBe(5);
});
