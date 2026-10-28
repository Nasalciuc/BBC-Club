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
    expect(a.reads()).toBe(2);
  });
});

describe("the cookie an answer is kept under", () => {
  /** Better Auth as production runs it: secure cookies, so it reads `__Secure-bbc.session_token` and nothing else. */
  function productionAuth() {
    const members: Record<string, typeof user> = {
      attacker: { ...user, id: "m-attacker" },
      victim: { ...user, id: "m-victim" },
    };
    let reads = 0;
    const auth = {
      $context: contextFor(SECURE),
      api: {
        getSession: async ({ headers }: { headers: Headers }) => {
          reads++;
          const token = tokenIn(headers, SECURE);
          return token && members[token] ? rowFor(token, members[token]) : null;
        },
      },
      handler: async () => new Response("{}", { status: 200 }),
    };
    return { auth, reads: () => reads };
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
});
