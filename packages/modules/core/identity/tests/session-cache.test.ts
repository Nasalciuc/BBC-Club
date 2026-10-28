/** ADR-IMPL-076: what the process keeps per session token — never past the minute, never past the session's expiry. */
import { describe, expect, it } from "bun:test";
import { createSessionCache, FORGOTTEN_MARGIN_MS, keyedToken, sessionKey } from "../src/application/session-cache";

const info = (id: string) => ({
  member: { id, email: `${id}@test.dev`, emailVerified: true as const, role: "member" },
  sessionId: `s-${id}`,
});

const COOKIE = "bbc.session_token";
const SECURE = "__Secure-bbc.session_token";
const cookie = (value: string) => new Headers({ Cookie: value });

describe("sessionKey", () => {
  it("hashes the session cookie Better Auth reads, never another, and ignores the rest of the cookie", () => {
    const a = sessionKey(cookie(`${COOKIE}=abc.sig; bbc.session_data=xyz`), COOKIE);
    expect(a).toBe(sessionKey(cookie(`x=1; ${SECURE}=abc.sig`), SECURE));
    expect(a).not.toContain("abc");
    // Read as better-call reads it: trimmed, unquoted, decoded.
    expect(sessionKey(cookie(`x=1;  ${COOKIE}="abc.sig" `), COOKIE)).toBe(a);
    expect(sessionKey(cookie(`${COOKIE}=abc%2Esig`), COOKIE)).toBe(a);
    // The other name is not the cookie: absent, it keys nothing; beside it, it changes nothing.
    expect(sessionKey(cookie(`${SECURE}=abc.sig`), COOKIE)).toBeNull();
    expect(sessionKey(cookie(`${COOKIE}=abc.sig`), SECURE)).toBeNull();
    expect(sessionKey(cookie(`${COOKIE}=other.sig; ${SECURE}=abc.sig`), SECURE)).toBe(a);
    // The first of two cookies of the name, as Better Auth takes it.
    expect(sessionKey(cookie(`${COOKIE}=abc.sig; ${COOKIE}=other.sig`), COOKIE)).toBe(a);
    expect(sessionKey(cookie(`${COOKIE}=; ${COOKIE}=abc.sig`), COOKIE)).toBeNull();
    expect(sessionKey(cookie("bbc.session_data=xyz"), COOKIE)).toBeNull();
    expect(sessionKey(new Headers(), COOKIE)).toBeNull();
  });

  it("names the token in that cookie, split from its signature as Better Auth splits it", () => {
    expect(keyedToken(cookie(`${COOKIE}=tok.c2ln%3D`), COOKIE)).toBe("tok");
    expect(keyedToken(cookie(`${COOKIE}=other.sig; ${SECURE}=tok.sig`), SECURE)).toBe("tok");
    expect(keyedToken(cookie(`${COOKIE}=nosignature`), COOKIE)).toBeNull();
    expect(keyedToken(cookie(`${COOKIE}=.sig`), COOKIE)).toBeNull();
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

  it("a read begun before its token or its member was forgotten puts nothing back; other forgets do not stop it", () => {
    const c = createSessionCache({ ttlMs: 60_000 });

    const sameKey = c.begin();
    c.forget("t");
    c.put("t", info("a"), null, sameKey);
    expect(c.get("t")).toBeNull();

    const sameMember = c.begin();
    c.forgetMember("a");
    c.put("u", info("a"), null, sameMember);
    expect(c.get("u")).toBeNull();

    const others = c.begin();
    c.forget("someone-else");
    c.forgetMember("b");
    c.put("v", info("a"), null, others);
    expect(c.get("v")?.member.id).toBe("a");

    // Begun after the forget: kept.
    c.put("t", info("a"), null, c.begin());
    expect(c.get("t")?.member.id).toBe("a");
  });

  it("keeps its notes of what was forgotten for the cache's time and a margin, and no more than its cap", () => {
    let clock = 1_000_000;
    const c = createSessionCache({ ttlMs: 60_000, maxEntries: 3, now: () => clock });
    c.forget("1");
    c.forgetMember("a");
    expect(c.notes()).toBe(2);
    clock += 60_000 + FORGOTTEN_MARGIN_MS + 1;
    c.forget("2");
    c.forgetMember("b");
    expect(c.notes()).toBe(2);
    c.forget("3");
    c.forget("4");
    c.forget("5");
    expect(c.notes()).toBe(4);
  });

  it("a note dropped while a read waits, by the cap or by age, still stops that read's answer", () => {
    let clock = 1_000_000;
    const c = createSessionCache({ ttlMs: 60_000, maxEntries: 3, now: () => clock });
    const byCap = c.begin();
    c.forget("T");
    for (const junk of ["j1", "j2", "j3"]) c.forget(junk); // T's note is pushed out
    c.put("T", info("a"), null, byCap);
    expect(c.get("T")).toBeNull();

    const byAge = c.begin();
    c.forgetMember("b");
    clock += 60_000 + FORGOTTEN_MARGIN_MS + 1;
    c.forgetMember("c"); // b's note has aged out
    c.put("U", info("b"), null, byAge);
    expect(c.get("U")).toBeNull();

    // A read begun after both: kept.
    c.put("T", info("a"), null, c.begin());
    expect(c.get("T")?.member.id).toBe("a");
  });

  it("an answer not put back still tells whose token it was", () => {
    const c = createSessionCache({ ttlMs: 60_000 });
    const since = c.begin();
    c.forgetMember("m");
    c.put("A", info("m"), null, since);
    expect(c.get("A")).toBeNull();
    expect(c.memberOf("A")).toBe("m");
  });

  it("remembers the members of answers not put back for the notes' time, and no more of them than its cap", () => {
    let clock = 1_000_000;
    const c = createSessionCache({ ttlMs: 60_000, maxEntries: 3, now: () => clock });
    const since = c.begin();
    c.forgetMember("m");
    for (const key of ["1", "2", "3", "4", "5"]) c.put(key, info("m"), null, since);
    expect(c.size()).toBe(0);
    expect(c.notes()).toBe(1 + 3); // the member's note and the three newest answers
    expect(c.memberOf("1")).toBeNull();
    expect(c.memberOf("5")).toBe("m");
    clock += 60_000 + FORGOTTEN_MARGIN_MS + 1;
    c.put("6", info("m"), null, since);
    expect(c.notes()).toBe(1 + 1);
    expect(c.memberOf("5")).toBeNull();
    expect(c.memberOf("6")).toBe("m");
  });

  it("counts hits and misses under identity.session", () => {
    const seen: string[] = [];
    const c = createSessionCache({ ttlMs: 60_000, metrics: { inc: (n, l) => seen.push(`${n}:${l?.ns}`) } });
    c.get("k");
    c.put("k", info("a"), null);
    c.get("k");
    expect(seen).toEqual(["cache_miss:identity.session", "cache_hit:identity.session"]);
  });

  it("a wall clock moved back keeps nothing past its time: the cache runs on the monotonic clock (G3)", async () => {
    const realNow = Date.now;
    let wall = realNow();
    Date.now = () => wall;
    try {
      const c = createSessionCache({ ttlMs: 50 });
      c.put("ttl", info("a"), null);
      c.put("expiry", info("b"), new Date(wall + 30)); // expires before the cache's time
      expect(c.get("ttl")).not.toBeNull();
      wall -= 3_600_000; // the wall clock goes back an hour
      await Bun.sleep(40);
      expect(c.get("expiry")).toBeNull(); // 30 ms of the session's life were left: gone after 40
      expect(c.get("ttl")).not.toBeNull();
      await Bun.sleep(20);
      expect(c.get("ttl")).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
