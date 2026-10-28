/** ADR-IMPL-076: the session behind a token, kept by the process for the cookie cache's minute — a read costs no
 *  session query after the first; a write reads fresh; a sign-out on this process is anonymous at once. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

/** What the app sends after the first minute: the session token alone, no fresh `session_data` (ADR-IMPL-076). */
const tokenOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((c) => /session_token=/.test(c))
    .join("; ");

const sessionReads = (log: string[]) => log.filter((q) => /from "auth"\."session"|from "session"/i.test(q));

describe("session kept per process", () => {
  it("one read of the session per token per minute; writes read fresh; sign-out forgets it", async () => {
    const log: string[] = [];
    const t = await testApp({ suite: "session-l1", queryLog: log });
    const cookie = tokenOnly(t.memberA.cookie);
    expect(cookie).toContain("session_token=");
    const read = async () => {
      log.length = 0;
      const res = await t.app.request("/v1/profile", { headers: { Cookie: cookie } });
      return { status: res.status, sessions: sessionReads(log).length };
    };

    const first = await read();
    expect(first.status).toBe(200);
    expect(first.sessions).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) expect(await read()).toEqual({ status: 200, sessions: 0 });

    // B's session ended in psql (another device's sign-out on another replica) before this process read it: a token it
    // does not keep reads the database, and is refused at once. One it keeps answers for the rest of the minute, as the
    // phone's cookie cache would, and a write is refused: "a session ended elsewhere" below.
    await t.db.execute(sql`DELETE FROM auth.session WHERE user_id = ${t.memberB.id}`);
    const b = tokenOnly(t.memberB.cookie);
    expect((await t.app.request("/v1/profile", { headers: { Cookie: b } })).status).toBe(401);

    log.length = 0;
    const out = await t.app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: cookie, Origin: t.appOrigin, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(out.status).toBe(200);
    expect((await read()).status).toBe(401);
  });

  it("only the cookie Better Auth reads finds what is kept: a cookie of the other name beside it changes nothing", async () => {
    const t = await testApp({ suite: "session-l1-cookie" });
    const value = (cookie: string) => tokenOnly(cookie).split("=").slice(1).join("=");
    const a = value(t.memberA.cookie);
    const b = value(t.memberB.cookie);
    const profile = async (cookie: string) => {
      const res = await t.app.request("/v1/profile", { headers: { Cookie: cookie } });
      return { status: res.status, body: await res.json() };
    };
    const own = await profile(`bbc.session_token=${b}`);
    expect(own.status).toBe(200);

    // A's session is kept on this process; B's request carries A's value under the name Better Auth does not read here.
    expect((await profile(`bbc.session_token=${a}`)).status).toBe(200);
    expect(await profile(`__Secure-bbc.session_token=${a}; bbc.session_token=${b}`)).toEqual(own);
    expect((await profile(`__Secure-bbc.session_token=${a}`)).status).toBe(401);
  });

  it("a bearer token, which Better Auth reads before the cookie, is never answered from the cookie's entry", async () => {
    const t = await testApp({ suite: "session-l1-bearer" });
    const value = (cookie: string) => decodeURIComponent(tokenOnly(cookie).split("=").slice(1).join("="));
    const a = tokenOnly(t.memberA.cookie);
    const b = tokenOnly(t.memberB.cookie);
    const profile = async (headers: Record<string, string>) => {
      const res = await t.app.request("/v1/profile", { headers });
      return { status: res.status, body: await res.json() };
    };
    const own = await profile({ Cookie: b });
    expect((await profile({ Cookie: a })).status).toBe(200); // A is kept

    // Better Auth reads the bearer token: B's session, not the entry kept for A's cookie.
    expect(await profile({ Cookie: a, Authorization: `bearer ${value(t.memberB.cookie)}` })).toEqual(own);

    // A sign-out by bearer ends A's session; what this process kept for A's cookie goes with it.
    const out = await t.app.request("/api/auth/sign-out", {
      method: "POST",
      headers: {
        Authorization: `bearer ${value(t.memberA.cookie)}`,
        Origin: t.appOrigin,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(out.status).toBe(200);
    expect((await profile({ Cookie: a })).status).toBe(401);
  });

  it("a session ended elsewhere: reads keep the minute, a write is refused at once", async () => {
    const t = await testApp({ suite: "session-l1-write" });
    const cookie = tokenOnly(t.memberA.cookie);
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookie } })).status).toBe(200);
    await t.db.execute(sql`DELETE FROM auth.session WHERE user_id = ${t.memberA.id}`);
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookie } })).status).toBe(200);
    const write = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Alex" }),
    });
    expect(write.status).toBe(401);
    // The fresh read forgot the token: reads are anonymous from now on, on this process.
    expect((await t.app.request("/v1/profile", { headers: { Cookie: cookie } })).status).toBe(401);
  });
});
