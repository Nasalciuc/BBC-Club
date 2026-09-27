import { test, expect } from "bun:test";
import { hashPassword } from "@better-auth/utils/password";

test("five concurrent password hashes never block the event loop for more than 50 ms", async () => {
  expect(import.meta.resolve("@better-auth/utils/password")).toContain("password.node"); // node:crypto, not @noble
  let worst = 0,
    last = performance.now();
  const iv = setInterval(() => {
    const n = performance.now();
    worst = Math.max(worst, n - last);
    last = n;
  }, 5);
  await Promise.all([1, 2, 3, 4, 5].map((i) => hashPassword(`pw-${i}-Secret!`)));
  clearInterval(iv);
  expect(worst).toBeLessThan(50); // measured 12 ms on Bun 1.3.4; a JS scrypt would block ≥ 350 ms
});
