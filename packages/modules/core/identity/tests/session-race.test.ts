/** ADR-IMPL-076: a read already waiting on the database when this process forgets a session never puts it back. */
import { describe, expect, it } from "bun:test";
import { createIdentityFacade } from "../src/application/facade";
import { createSessionCache, sessionKey } from "../src/application/session-cache";

/** What Better Auth answers for the token before it is ended. */
const row = {
  user: { id: "m1", email: "m1@test.dev", emailVerified: true, role: "member" },
  session: { id: "s1", expiresAt: new Date(Date.now() + 3_600_000) },
};

/** An auth whose first session read waits until `release`; every read after it finds the session ended. */
function slowAuth() {
  let release!: (v: unknown) => void;
  const pending = new Promise((r) => (release = r));
  let reads = 0;
  const auth = {
    api: { getSession: async () => (++reads === 1 ? pending : null) },
    handler: async () => new Response("{}", { status: 200 }),
  };
  return { auth, release: () => release(row), reads: () => reads };
}

describe("a session ended while a read waits", () => {
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
    sessions.put(sessionKey(deviceC)!, { member: row.user, sessionId: "s3" } as never, null, sessions.begin()); // C reads after
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
