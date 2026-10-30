/** ADR-IMPL-076: a read already waiting on the database when this process forgets a session never puts it back; an
 *  answer is kept only under the cookie Better Auth reads, and only that cookie finds it again. */
import { describe, expect, it } from "bun:test";
import { createIdentityFacade } from "../src/application/facade";
import { createSessionCache, sessionKey } from "../src/application/session-cache";

const COOKIE = "bbc.session_token";
const SECURE = "__Secure-bbc.session_token";
const user = { id: "m1", email: "m1@test.dev", emailVerified: true, role: "member" };

/** The token in the first cookie called `name`, read here on its own (not through the cache's reader). */
const tokenIn = (headers: Headers, name: string) =>
  headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .split(".")[0] ?? null;

/** What Better Auth answers for a live session: the session row carries the token it verified. */
const rowFor = (token: string, member = user) => ({
  user: member,
  session: { id: `s-${token}`, token, expiresAt: new Date(Date.now() + 3_600_000) },
});

/** Better Auth's context as the facade reads it: the one cookie a session is read from. */
const contextFor = (name: string) => Promise.resolve({ authCookies: { sessionToken: { name } } });

/** An auth whose first session read waits until `release`; every read after it finds the session ended. */
function slowAuth() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let reads = 0;
  const auth = {
    $context: contextFor(COOKIE),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        if (++reads > 1) return null;
        await gate;
        const token = tokenIn(headers, COOKIE);
        return token ? rowFor(token) : null;
      },
    },
    handler: async () => new Response("{}", { status: 200 }),
  };
  return { auth, release: () => release(), reads: () => reads };
}

describe("a session ended while a read waits", () => {
  it("with nothing forgotten meanwhile, the read's answer is kept", async () => {
    const a = slowAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });
    const headers = new Headers({ Cookie: `${COOKIE}=tok.sig` });

    const inFlight = f.getSession(headers);
    a.release();
    await inFlight;

    expect(sessions.get(sessionKey(headers, COOKIE)!)?.member.id).toBe("m1");
  });

  it("a password change forgets the member while another device's read waits: the read puts nothing back", async () => {
    const a = slowAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });
    const other = new Headers({ Cookie: `${COOKIE}=other.sig` });

    const inFlight = f.getSession(other);
    sessions.forgetMember("m1");
    a.release();
    await inFlight;

    expect(sessions.get(sessionKey(other, COOKIE)!)).toBeNull();
  });

  it("a revoke whose own read was not put back still forgets the member's other tokens", async () => {
    const a = slowAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });
    const deviceA = new Headers({ Cookie: `${COOKIE}=a.sig` });
    const deviceC = new Headers({ Cookie: `${COOKIE}=c.sig` });

    const principal = f.getSession(deviceA, { fresh: true }); // A's POST /api/auth/revoke-sessions, read first
    sessions.forgetMember("m1"); // meanwhile device B changes the password
    sessions.put(sessionKey(deviceC, COOKIE)!, { member: user, sessionId: "s3" } as never, null, sessions.begin()); // C reads after
    a.release();
    await principal; // A's answer is not put back
    await f.handler(new Request("http://localhost/api/auth/revoke-sessions", { method: "POST", headers: deviceA }));

    expect(sessions.get(sessionKey(deviceC, COOKIE)!)).toBeNull();
  });

  it("a sign-out on this process is anonymous at once, even with a read in flight", async () => {
    const a = slowAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });
    const headers = new Headers({ Cookie: `${COOKIE}=tok.sig` });

    const inFlight = f.getSession(headers);
    await f.handler(new Request("http://localhost/api/auth/sign-out", { method: "POST", headers }));
    a.release();
    expect((await inFlight)?.member.id).toBe("m1");

    expect(sessions.get(sessionKey(headers, COOKIE)!)).toBeNull();
    expect(await f.getSession(headers)).toBeNull();
    // The read in flight, the sign-out's own (whose token it is: nothing was kept yet), and the read after it.
    expect(a.reads()).toBe(3);
  });
});

describe("the cookie an answer is kept under", () => {
  /** Better Auth as production runs it: secure cookies, so it reads `__Secure-bbc.session_token` and nothing else —
   *  unless `bearer()` finds `Authorization: bearer …` (any case), which it reads instead. */
  function productionAuth() {
    const members: Record<string, typeof user> = {
      attacker: { ...user, id: "m-attacker" },
      victim: { ...user, id: "m-victim" },
    };
    let reads = 0;
    const fresh: boolean[] = [];
    const tokenOf = (headers: Headers) => {
      const bearer = headers.get("authorization")?.match(/^bearer (.+)$/i)?.[1];
      return bearer ? bearer.split(".")[0] : tokenIn(headers, SECURE);
    };
    const auth = {
      $context: contextFor(SECURE),
      api: {
        getSession: async ({ headers, query }: { headers: Headers; query?: { disableCookieCache?: boolean } }) => {
          reads++;
          fresh.push(query?.disableCookieCache === true);
          const token = tokenOf(headers);
          return token && members[token] ? rowFor(token, members[token]) : null;
        },
        deleteUser: async () => ({ success: true }),
      },
      handler: async () => new Response("{}", { status: 200 }),
    };
    return { auth, reads: () => reads, fresh: () => fresh };
  }

  it("never a cookie of the other name, read or kept", async () => {
    const a = productionAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });

    const plantedOnly = new Headers({ Cookie: `${COOKIE}=attacker.sig` });
    expect(await f.getSession(plantedOnly)).toBeNull();
    expect(sessions.size()).toBe(0);

    // One's own session, kept under the cookie Better Auth reads.
    const own = new Headers({ Cookie: `${SECURE}=attacker.sig` });
    expect((await f.getSession(own))?.member.id).toBe("m-attacker");
    expect(sessions.size()).toBe(1);

    // That same value planted under the other name beside someone's own cookie finds nothing kept: the answer is the
    // one Better Auth gives, for the cookie it reads.
    const both = new Headers({ Cookie: `${COOKIE}=attacker.sig; ${SECURE}=victim.sig` });
    expect((await f.getSession(both))?.member.id).toBe("m-victim");
    expect(a.reads()).toBe(3);
    expect((await f.getSession(both))?.member.id).toBe("m-victim"); // now from the victim's own entry
    expect(a.reads()).toBe(3);
  });

  it("an answer for another token than the cookie's is given, never kept", async () => {
    // However Better Auth came to read another token than the cookie the key is taken from, its answer is not kept.
    const auth = {
      $context: contextFor(COOKIE),
      api: { getSession: async () => rowFor("other") },
      handler: async () => new Response("{}", { status: 200 }),
    };
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(auth as never, {} as never, { sessions });
    expect((await f.getSession(new Headers({ Cookie: `${COOKIE}=tok.sig` })))?.member.id).toBe("m1");
    expect(sessions.size()).toBe(0);
  });

  it("a request with a bearer token, which Better Auth reads before the cookie, is neither answered nor kept", async () => {
    const a = productionAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });
    expect((await f.getSession(new Headers({ Cookie: `${SECURE}=attacker.sig` })))?.member.id).toBe("m-attacker");

    const withBearer = new Headers({ Cookie: `${SECURE}=attacker.sig`, Authorization: "bearer victim.sig" });
    expect((await f.getSession(withBearer))?.member.id).toBe("m-victim");
    expect((await f.getSession(withBearer))?.member.id).toBe("m-victim");
    expect(a.reads()).toBe(3);
    expect(sessions.size()).toBe(1);
    // Read from the database each time, past Better Auth's own cookie cache too: never a stale `session_data`.
    expect(a.fresh()).toEqual([true, true, true]);
  });

  it("a sign-out or a deletion sent with a bearer token forgets the member Better Auth acts on", async () => {
    const a = productionAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });
    const victim = new Headers({ Cookie: `${SECURE}=victim.sig` });
    const attacker = new Headers({ Cookie: `${SECURE}=attacker.sig` });
    await f.getSession(victim);
    await f.getSession(attacker);
    expect(sessions.size()).toBe(2);

    const signOut = new Headers({ Cookie: `${SECURE}=attacker.sig`, Authorization: "BEARER victim.sig" });
    await f.handler(new Request("http://localhost/api/auth/sign-out", { method: "POST", headers: signOut }));
    expect(sessions.get(sessionKey(victim, SECURE)!)).toBeNull();
    expect(sessions.get(sessionKey(attacker, SECURE)!)?.member.id).toBe("m-attacker");

    await f.deleteAccount(new Headers({ Authorization: "bearer attacker.sig" }), "password");
    expect(sessions.size()).toBe(0);
  });
});

describe("a write to Better Auth forgets the sessions it ends", () => {
  /** Two members' tokens; Better Auth answers each from the cookie and `handler` answers `status`. */
  function twoMembers(status = 200) {
    const members: Record<string, typeof user> = {
      a: user,
      c: user,
      b: { ...user, id: "m2" },
    };
    const auth = {
      $context: contextFor(COOKIE),
      api: {
        getSession: async ({ headers }: { headers: Headers }) => {
          const token = tokenIn(headers, COOKIE);
          return token && members[token] ? rowFor(token, members[token]) : null;
        },
      },
      handler: async () => new Response("{}", { status }),
    };
    return auth;
  }
  const cookie = (token: string) => new Headers({ Cookie: `${COOKIE}=${token}.sig` });

  it("a token this process never kept: its member is read fresh, and their other entries go", async () => {
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(twoMembers() as never, {} as never, { sessions });
    await f.getSession(cookie("c")); // device C of m1, kept here
    await f.getSession(cookie("b")); // m2, kept here
    expect(sessions.size()).toBe(2);

    // Device A of m1 revokes from a process that never read A.
    await f.handler(new Request("http://localhost/api/auth/revoke-sessions", { method: "POST", headers: cookie("a") }));
    expect(sessions.get(sessionKey(cookie("c"), COOKIE)!)).toBeNull();
    expect(sessions.get(sessionKey(cookie("b"), COOKIE)!)?.member.id).toBe("m2");
  });

  it("a reset by code, which carries no session, forgets every session this process keeps once it succeeds", async () => {
    const reset = (f: ReturnType<typeof createIdentityFacade>) =>
      f.handler(new Request("http://localhost/api/auth/email-otp/reset-password", { method: "POST" }));

    const refused = createSessionCache({ ttlMs: 60_000 });
    const g = createIdentityFacade(twoMembers(400) as never, {} as never, { sessions: refused });
    await g.getSession(cookie("c"));
    await reset(g); // a wrong code ends nothing
    expect(refused.size()).toBe(1);

    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(twoMembers() as never, {} as never, { sessions });
    await f.getSession(cookie("c"));
    await f.getSession(cookie("b"));
    const since = sessions.begin(); // a read already waiting when the reset lands
    await reset(f);
    expect(sessions.size()).toBe(0);
    sessions.put(sessionKey(cookie("c"), COOKIE)!, { member: user, sessionId: "s" } as never, null, since);
    expect(sessions.size()).toBe(0);
    expect((await f.getSession(cookie("b")))?.member.id).toBe("m2"); // read again, and kept again
    expect(sessions.size()).toBe(1);
  });
});
