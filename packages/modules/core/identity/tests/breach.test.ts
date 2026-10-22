import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";
import { BreachCheckUnavailable, breachCheck, isPasswordBreached } from "../src/infrastructure/breach";

const sha1 = (p: string) => createHash("sha1").update(p).digest("hex").toUpperCase();

/** A range endpoint stand-in: records what left the server, answers with `lines`. */
function rangeApi(lines: string[], status = 200) {
  const asked: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    asked.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(lines.join("\r\n"), { status });
  }) as unknown as typeof fetch;
  return { asked, fetchImpl };
}

describe("breached-password check (k-anonymity range query)", () => {
  it("sends only the first five hex characters, with padding, and finds a listed suffix", async () => {
    const hash = sha1("password123456");
    const api = rangeApi([`0018A45C4D1DEF81644B54AB7F969B88D65:1`, `${hash.slice(5)}:2534`]);
    expect(await isPasswordBreached("password123456", api.fetchImpl)).toBe(true);
    expect(api.asked[0]?.url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(api.asked[0]?.url).not.toContain(hash.slice(5));
    expect(api.asked[0]?.headers["Add-Padding"]).toBe("true");
  });

  it("a suffix that is not listed, or only a padding row (count 0), is not breached", async () => {
    const hash = sha1("fine-pass-2026x");
    expect(
      await isPasswordBreached("fine-pass-2026x", rangeApi(["0018A45C4D1DEF81644B54AB7F969B88D65:3"]).fetchImpl),
    ).toBe(false);
    expect(await isPasswordBreached("fine-pass-2026x", rangeApi([`${hash.slice(5)}:0`]).fetchImpl)).toBe(false);
  });

  it("fails closed: an unreachable or failing list throws, it never says 'not breached'", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(isPasswordBreached("fine-pass-2026x", down)).rejects.toBeInstanceOf(BreachCheckUnavailable);
    await expect(isPasswordBreached("fine-pass-2026x", rangeApi([], 503).fetchImpl)).rejects.toBeInstanceOf(
      BreachCheckUnavailable,
    );
  });

  it("tests use a predicate, or find nothing breached without one; never the network", async () => {
    expect(await breachCheck({ env: { NODE_ENV: "test" } })("password123456")).toBe(false);
    expect(await breachCheck({ env: { NODE_ENV: "production" }, breachedPassword: (p) => p === "x" })("x")).toBe(true);
  });
});
