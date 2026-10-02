import { test, expect } from "bun:test";
import { hashPassword } from "@better-auth/utils/password";

test("five concurrent password hashes never block the event loop for more than 200 ms", async () => {
  expect(import.meta.resolve("@better-auth/utils/password")).toContain("password.node"); // node:crypto, not @noble
  let worst = 0,
    last = performance.now();
  const iv = setInterval(() => {
    const n = performance.now();
    worst = Math.max(worst, n - last);
    last = n;
  }, 5);
  await Promise.all([1, 2, 3, 4, 5].map((i) => hashPassword(`pw-${i}-Secret!`)));
  await new Promise((resolve) => setTimeout(resolve, 10));
  clearInterval(iv);
  // Off-thread: 12 ms locally, up to ~70 ms on a busy 2-vCPU CI runner (five scrypt threads compete with the main one).
  // A JS scrypt blocks ≥ 350 ms, so 200 ms keeps a margin on both sides; line 5 proves the implementation itself.
  expect(worst).toBeLessThan(200);
});
