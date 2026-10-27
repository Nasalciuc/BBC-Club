/** ADR-IMPL-076: what the process keeps per session token — never past the minute, never past the session's expiry. */
import { describe, expect, it } from "bun:test";
import { createSessionCache, sessionKey } from "../src/application/session-cache";

const info = (id: string) => ({
  member: { id, email: `${id}@test.dev`, emailVerified: true as const, role: "member" },
  sessionId: `s-${id}`,
});

describe("sessionKey", () => {
  it("hashes the session token, secure or not, and ignores the rest of the cookie", () => {
    const a = sessionKey(new Headers({ Cookie: "bbc.session_token=abc.sig; bbc.session_data=xyz" }));
    const b = sessionKey(new Headers({ Cookie: "x=1; __Secure-bbc.session_token=abc.sig" }));
    expect(a).toBe(b);
    expect(a).not.toContain("abc");
    expect(sessionKey(new Headers({ Cookie: "bbc.session_data=xyz" }))).toBeNull();
    expect(sessionKey(new Headers())).toBeNull();
  });
});

describe("createSessionCache", () => {
  it("keeps an entry for the minute, or until the session expires if that is sooner", () => {
    let clock = 1_000_000;
    const c = createSessionCache({ ttlMs: 60_000, now: () => clock });
    c.put("k", info("a"), null);
    c.put("soon", info("b"), new Date(clock + 5_000));
    c.put("gone", info("c"), new Date(clock - 1));
    expect(c.get("k")?.member.id).toBe("a");
    expect(c.get("gone")).toBeNull();
    clock += 5_000;
    expect(c.get("soon")).toBeNull();
    clock += 54_999;
    expect(c.get("k")?.member.id).toBe("a");
    clock += 1;
    expect(c.get("k")).toBeNull();
  });

  it("caps its entries, oldest first, and forgets a member's every token", () => {
    const c = createSessionCache({ ttlMs: 60_000, maxEntries: 3 });
    c.put("1", info("a"), null);
    c.put("2", info("a"), null);
    c.put("3", info("b"), null);
    c.put("4", info("c"), null);
    expect(c.size()).toBe(3);
    expect(c.get("1")).toBeNull();
    c.forgetMember("a");
    expect(c.get("2")).toBeNull();
    expect(c.get("3")?.member.id).toBe("b");
    expect(c.memberOf("4")).toBe("c");
    c.forget("4");
    expect(c.size()).toBe(1);
  });

  it("counts hits and misses under identity.session", () => {
    const seen: string[] = [];
    const c = createSessionCache({ ttlMs: 60_000, metrics: { inc: (n, l) => seen.push(`${n}:${l?.ns}`) } });
    c.get("k");
    c.put("k", info("a"), null);
    c.get("k");
    expect(seen).toEqual(["cache_miss:identity.session", "cache_hit:identity.session"]);
  });
});
