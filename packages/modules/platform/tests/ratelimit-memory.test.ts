import { test, expect } from "bun:test";
import { createMemoryLimiter } from "../src/ratelimit/memory-store";

test("burst then steady rate, retry-after exact", () => {
  const l = createMemoryLimiter();
  const t = 1_000_000;
  for (let i = 0; i < 20; i++) expect(l.check("m:1", 60, 60_000, 20, t).allowed).toBe(true);
  const d = l.check("m:1", 60, 60_000, 20, t);
  expect(d.allowed).toBe(false);
  expect(d.retryAfterMs).toBe(1_000);
  expect(l.check("m:1", 60, 60_000, 20, t + 1_000).allowed).toBe(true);
});

test("clients are independent", () => {
  const l = createMemoryLimiter();
  const t = 5_000_000;
  for (let i = 0; i < 20; i++) l.check("m:A", 60, 60_000, 20, t);
  expect(l.check("m:A", 60, 60_000, 20, t).allowed).toBe(false);
  expect(l.check("m:B", 60, 60_000, 20, t).allowed).toBe(true);
});

test("memory stays bounded under a flood of distinct keys", () => {
  const l = createMemoryLimiter({ maxKeys: 1_000 });
  const t = 9_000_000;
  for (let i = 0; i < 50_000; i++) l.check(`ip:${i}`, 60, 60_000, 20, t);
  expect(l.size()).toBeLessThanOrEqual(1_000);
});

test("cost per check", () => {
  const l = createMemoryLimiter();
  const n = 200_000;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) l.check(`m:${i % 5_000}`, 120, 60_000, 60);
  const us = ((performance.now() - t0) * 1000) / n;
  console.log(`memory limiter: ${us.toFixed(2)} µs per check`);
  expect(us).toBeLessThan(5);
});
