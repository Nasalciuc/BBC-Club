/** ADR-IMPL-076: a read already waiting on the database when this process forgets a session never puts it back; an
 *  answer is kept only under the cookie Better Auth verified. */
import { describe, expect, it } from "bun:test";
import { createIdentityFacade } from "../src/application/facade";
import { createSessionCache, keyedToken, sessionKey } from "../src/application/session-cache";

const user = { id: "m1", email: "m1@test.dev", emailVerified: true, role: "member" };
/** What Better Auth answers for a live session: the session row carries the token it verified. */
const rowFor = (token: string | null) => ({
  user,
  session: { id: "s1", token, expiresAt: new Date(Date.now() + 3_600_000) },
});

/** An auth whose first session read waits until `release`; every read after it finds the session ended. */
function slowAuth() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let reads = 0;
  const auth = {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        if (++reads > 1) return null;
        await gate;
        return rowFor(keyedToken(headers));
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
    const headers = new Headers({ Cookie: "bbc.session_token=tok.sig" });

    const inFlight = f.getSession(headers);
    a.release();
    await inFlight;

    expect(sessions.get(sessionKey(headers)!)?.member.id).toBe("m1");
  });

  it("a password change forgets the member while another device's read waits: the read puts nothing back", async () => {
    const a = slowAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });
    const other = new Headers({ Cookie: "bbc.session_token=other.sig" });

    const inFlight = f.getSession(other);
    sessions.forgetMember("m1");
    a.release();
    await inFlight;

    expect(sessions.get(sessionKey(other)!)).toBeNull();
  });

  it("a revoke whose own read was not put back still forgets the member's other tokens", async () => {
    const a = slowAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });
    const deviceA = new Headers({ Cookie: "bbc.session_token=a.sig" });
    const deviceC = new Headers({ Cookie: "bbc.session_token=c.sig" });

    const principal = f.getSession(deviceA, { fresh: true }); // A's POST /api/auth/revoke-sessions, read first
    sessions.forgetMember("m1"); // meanwhile device B changes the password
    sessions.put(sessionKey(deviceC)!, { member: user, sessionId: "s3" } as never, null, sessions.begin()); // C reads after
    a.release();
    await principal; // A's answer is not put back
    await f.handler(new Request("http://localhost/api/auth/revoke-sessions", { method: "POST", headers: deviceA }));

    expect(sessions.get(sessionKey(deviceC)!)).toBeNull();
  });

  it("a sign-out on this process is anonymous at once, even with a read in flight", async () => {
    const a = slowAuth();
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(a.auth as never, {} as never, { sessions });
    const headers = new Headers({ Cookie: "bbc.session_token=tok.sig" });

    const inFlight = f.getSession(headers);
    await f.handler(new Request("http://localhost/api/auth/sign-out", { method: "POST", headers }));
    a.release();
    expect((await inFlight)?.member.id).toBe("m1");

    expect(sessions.get(sessionKey(headers)!)).toBeNull();
    expect(await f.getSession(headers)).toBeNull();
    expect(a.reads()).toBe(2);
  });
});

describe("the cookie an answer is kept under", () => {
  it("never another cookie of the same name than the one Better Auth verified", async () => {
    // Better Auth in production reads `__Secure-bbc.session_token` only.
    const auth = {
      api: {
        getSession: async ({ headers }: { headers: Headers }) => {
          const secure = headers.get("cookie")?.match(/__Secure-bbc\.session_token=([^;.]+)/)?.[1];
          return secure ? rowFor(secure) : null;
        },
      },
      handler: async () => new Response("{}", { status: 200 }),
    };
    const sessions = createSessionCache({ ttlMs: 60_000 });
    const f = createIdentityFacade(auth as never, {} as never, { sessions });

    const both = new Headers({ Cookie: "bbc.session_token=planted.sig; __Secure-bbc.session_token=victim.sig" });
    expect((await f.getSession(both))?.member.id).toBe("m1");
    expect(sessions.size()).toBe(0);

    const plantedOnly = new Headers({ Cookie: "bbc.session_token=planted.sig" });
    expect(await f.getSession(plantedOnly)).toBeNull();
  });
});
