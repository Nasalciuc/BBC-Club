/** ADR-IMPL-076: two replicas of the host on one database, each keeping the sessions it read. A session ended on
 *  replica A — by a password change, the account's deletion, a reset by code, or its row deleted in psql — may still be
 *  answered by replica B from what B keeps (the window ADR-IMPL-027 accepted for the cookie cache), and is refused by B
 *  no later than half a second past that time. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { loadEnv } from "@bbc/shared/env";
import { buildApp } from "../src/index";
import { testApp } from "./helpers/test-app";

/** SESSION_COOKIE_CACHE_SECONDS's floor (packages/shared/src/env.ts): the shortest a deployed host keeps a session. */
const TTL_S = 10;
const SUITE = "session-two-replicas";

/** What the app sends after the first minute: the session token alone, no fresh `session_data` (ADR-IMPL-076). */
const tokenOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((c) => /session_token=/.test(c))
    .join("; ");

describe("a session ended on one replica, on the other", () => {
  it("replica B refuses it within the cookie cache's time and half a second, whatever ended it on replica A", async () => {
    const t = await testApp({ suite: SUITE, env: { SESSION_COOKIE_CACHE_SECONDS: String(TTL_S) } });
    // Replica B: the same host built again on the same database, with a session cache of its own (ADR-IMPL-076). The pool
    // is A's: B's DATABASE_URL is not read when a database is given.
    const b = await buildApp({
      env: loadEnv({ ...process.env, CORS_ORIGINS: "", SESSION_COOKIE_CACHE_SECONDS: String(TTL_S) }),
      db: t.db,
      overrides: { email: t.email, crm: t.crm, push: t.push },
      startPoller: false,
    });
    try {
      const carol = await t.auth.createMember(`carol.${SUITE}@test.dev`);
      const dana = await t.auth.createMember(`dana.${SUITE}@test.dev`);
      await t.drainAll(); // member.registered → profiles

      // Each member's phone: a session both replicas have read and keep. The password change and the deletion are made
      // from a second session of the same member, on A.
      const kept = {
        "password change": tokenOnly(t.memberA.cookie),
        "account deleted": tokenOnly(t.memberB.cookie),
        "reset by code": tokenOnly(await t.auth.cookieFor(carol.email, carol.password)),
        "row deleted in psql": tokenOnly(await t.auth.cookieFor(dana.email, dana.password)),
      };
      type Case = keyof typeof kept;
      const cases = Object.keys(kept) as Case[];
      const changer = await t.auth.cookieFor(t.memberA.email, t.memberA.password);
      const deleter = await t.auth.cookieFor(t.memberB.email, t.memberB.password);

      const profileOn = async (app: { request: typeof t.app.request }, c: Case) =>
        (await app.request("/v1/profile", { headers: { Cookie: kept[c] } })).status;
      const on = async (app: { request: typeof t.app.request }) =>
        Object.fromEntries(await Promise.all(cases.map(async (c) => [c, await profileOn(app, c)] as const)));
      const all = (status: number) => Object.fromEntries(cases.map((c) => [c, status]));

      expect(await on(t.app)).toEqual(all(200));
      expect(await on(b.app)).toEqual(all(200));
      // B put each answer in its memory before this instant: what it keeps runs out by TTL_S past it.
      const keptBy = Date.now();

      const change = await t.app.request("/v1/account/password", {
        method: "POST",
        headers: { Cookie: changer, "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: "newClubPass2026!", currentPassword: t.memberA.password }),
      });
      expect(change.status).toBe(200);

      const deleted = await t.app.request("/api/auth/delete-user", {
        method: "POST",
        headers: { Cookie: deleter, "Content-Type": "application/json", Origin: t.appOrigin },
        body: JSON.stringify({ password: t.memberB.password }),
      });
      expect(deleted.status).toBe(200);

      const authCall = (path: string, body: Record<string, string>) =>
        t.app.request(`/api/auth${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: t.appOrigin },
          body: JSON.stringify(body),
        });
      const sent = await authCall("/email-otp/send-verification-otp", { email: carol.email, type: "forget-password" });
      expect(sent.status).toBe(200);
      const otp = t.email.lastOtp(carol.email);
      expect(otp).toBeTruthy();
      const reset = await authCall("/email-otp/reset-password", {
        email: carol.email,
        otp: otp ?? "",
        password: "resetClubPass2026!",
      });
      expect(reset.status).toBe(200);

      await t.db.execute(sql`DELETE FROM auth.session WHERE user_id = ${dana.id}`);

      // A forgot what it kept for the members it ended sessions for; the row deleted in psql it cannot know of.
      expect(await on(t.app)).toEqual({ ...all(401), "row deleted in psql": 200 });
      // B answers from what it keeps, for the rest of its time.
      expect(await on(b.app)).toEqual(all(200));

      const wait = keptBy + TTL_S * 1000 + 500 - Date.now();
      expect(wait).toBeGreaterThan(0); // the cases above ran inside B's time: the 200s were B's memory
      await Bun.sleep(wait);
      expect(await on(b.app)).toEqual(all(401));
      expect(await on(t.app)).toEqual(all(401));
    } finally {
      await b.platform.close();
      await b.platform.poller.stop();
      await t.close();
    }
  }, 30_000);
});
