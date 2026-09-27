import { test, expect, beforeAll, afterAll } from "bun:test";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { gcraCheck } from "../src/ratelimit/pg-store";

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

test("no boundary effect: 10 at :59 and 10 at :01 is not 20", async () => {
  const t = 1_800_003_540_000;
  let ok = 0;
  for (let i = 0; i < 10; i++) if ((await gcraCheck(iso.db, "k:C", 10, 3_600_000, 5, t)).allowed) ok++;
  for (let i = 0; i < 10; i++) if ((await gcraCheck(iso.db, "k:C", 10, 3_600_000, 5, t + 120_000)).allowed) ok++;
  expect(ok).toBe(5);
});
