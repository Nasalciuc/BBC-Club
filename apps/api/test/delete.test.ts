import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { photoWebp } from "@bbc/shared/media/webp-fixtures";
import { testApp } from "./helpers/test-app";

/** Host integration: account deletion cascades across schemas via member.deleted consumers. */
describe("account deletion — zero rows everywhere", () => {
  it("removes auth rows, cascades our schemas via member.deleted, tombstones the journal", async () => {
    const t = await testApp({ suite: "delete" });
    const email = t.memberA.email;
    const memberId = t.memberA.id;

    await t.seedMemberData(memberId);
    const offerId = await t.seedBroadcastOffer();
    // An offer made to this member alone names them in target_member_id; it goes with them.
    await t.seedTargetedOffer(memberId);
    // A campaign that finished before the cursor was cleared at the end still holds a member id.
    await t.db.execute(sql`
      INSERT INTO notifications.campaigns (offer_id, source_event_id, category, title, last_member_id, status, finished_at)
      VALUES (${offerId}::uuid, 'delete-test-campaign', 'offers_broadcast', 'Autumn in Paris', ${memberId}, 'done', now())`);
    await t.db.execute(sql`
      INSERT INTO engagement.offer_responses (offer_id, member_id, response)
      VALUES (${offerId}::uuid, ${memberId}, 'interested')
      ON CONFLICT DO NOTHING`);
    await t.db.execute(
      sql`INSERT INTO proposals.offer_targets (offer_id, member_id) VALUES (${offerId}::uuid, ${memberId})`,
    );
    await t.db.execute(
      sql`INSERT INTO members.notification_preferences (member_id, category, enabled)
          VALUES (${memberId}, 'offers_personal', true), (${memberId}, 'offers_broadcast', false)`,
    );
    await t.db.execute(
      sql`INSERT INTO personalization.member_features (member_id, features) VALUES (${memberId}, '{}'::jsonb)`,
    );
    await t.db.execute(sql`
      INSERT INTO personalization.proposal_candidates (member_id, offer_draft, score, reasons, ranker_version)
      VALUES (${memberId}, '{"title":"x"}'::jsonb, 0.5, '["route"]'::jsonb, 'rules-v1')`);

    // The member's own photo (ADR-IMPL-070): the bytes in members.profile_photo, made-up here (D13).
    const photo = await t.app.request("/v1/profile/photo", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "image/webp" },
      body: photoWebp(),
    });
    expect(photo.status).toBe(200);

    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string };

    const identity = t.registry.facade<any>("identity");
    await identity.deleteAccount(new Headers({ Cookie: t.memberA.cookie }), t.memberA.password);
    await t.drainAll();

    const count = async (schema: string, table: string, col: string) => {
      const rows: any[] = await t.db.execute(
        sql`SELECT count(*)::int AS n FROM ${sql.raw(`${schema}."${table}"`)} WHERE ${sql.raw(col)} = ${memberId}`,
      );
      return Number(rows[0]?.n ?? 0);
    };

    expect(await count("auth", "user", "id")).toBe(0);
    expect(await count("auth", "session", "user_id")).toBe(0);
    expect(await count("members", "profile", "member_id")).toBe(0);
    expect(await count("members", "notification_preferences", "member_id")).toBe(0);
    expect(await count("members", "profile_photo", "member_id")).toBe(0);
    expect(await count("notifications", "device_tokens", "member_id")).toBe(0);
    expect(await count("notifications", "notifications", "member_id")).toBe(0);
    expect(await count("engagement", "offer_responses", "member_id")).toBe(0);
    expect(await count("requests", "requests", "member_id")).toBe(0);
    expect(await count("proposals", "offer_targets", "member_id")).toBe(0);
    expect(await count("proposals", "offers", "target_member_id")).toBe(0);
    expect(await count("notifications", "campaigns", "last_member_id")).toBe(0);
    expect(await count("personalization", "member_features", "member_id")).toBe(0);
    expect(await count("personalization", "proposal_candidates", "member_id")).toBe(0);

    const [redacted]: any = await t.db.execute(
      sql`SELECT member_id, contact_name, contact_email, contact_phone, status
          FROM requests.requests WHERE id = ${createdBody.id}`,
    );
    expect(redacted.member_id).toBeNull();
    expect(redacted.contact_name).toBe("[deleted]");
    expect(redacted.contact_email).toBe("deleted@invalid");
    expect(redacted.contact_phone).toBe("+0000000");
    expect(redacted.status).toBe("closed");

    const tombstoned = await t.journal.forMember(memberId);
    expect(tombstoned.every((e) => !JSON.stringify(e.payload).includes(email))).toBe(true);
    // platform.domain_events keeps the rows; payload is tombstoned (G11 names the table).
    expect(tombstoned.length).toBeGreaterThan(0);
    await t.close();
  });
});

/** Better Auth 1.6.31 checks the password only `if (ctx.body.password)`: an empty one skipped it, and a session signed in
 *  within a day deleted the account with nothing typed. The club asks for the password every time. */
describe("account deletion needs the password", () => {
  it("an empty, missing or wrong password deletes nothing; the right one deletes the account", async () => {
    const t = await testApp({ suite: "delete-password" });
    const memberId = t.memberA.id;
    let ip = 10;
    // /delete-user allows 3 an hour per address: each attempt from its own, so the limit does not answer for the hook.
    const del = (body: unknown) =>
      t.app.request("/api/auth/delete-user", {
        method: "POST",
        headers: {
          Cookie: t.memberA.cookie,
          "Content-Type": "application/json",
          Origin: t.appOrigin,
          "X-Forwarded-For": `203.0.113.${ip++}, 173.245.48.1`,
        },
        body: JSON.stringify(body),
      });
    const users = async () => {
      const rows: any[] = await t.db.execute(sql`SELECT count(*)::int AS n FROM auth."user" WHERE id = ${memberId}`);
      return Number(rows[0]?.n ?? 0);
    };

    for (const body of [{ password: "" }, { password: "   " }, {}]) {
      const r = await del(body);
      expect(r.status).toBe(400);
      // The code the app already maps to the field's error (and never to "deleted").
      expect(((await r.json()) as { code?: string }).code).toBe("INVALID_PASSWORD");
      expect(await users()).toBe(1);
    }

    const wrong = await del({ password: "not-the-password" });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { code?: string }).code).toBe("INVALID_PASSWORD");
    expect(await users()).toBe(1);

    const right = await del({ password: t.memberA.password });
    expect(right.status).toBe(200);
    expect(await users()).toBe(0);
    await t.close();
  });

  it("another device's cached session cannot write for a deleted member (cookie cache)", async () => {
    // Writes read the session from the database; reads may keep the cached cookie for SESSION_COOKIE_CACHE_SECONDS.
    const t = await testApp({ suite: "delete-other-device", env: { SESSION_COOKIE_CACHE_SECONDS: "10" } });
    const memberId = t.memberA.id;
    const here = t.memberA.cookie;
    const elsewhere = await t.auth.cookieFor(t.memberA.email, t.memberA.password);
    // The other phone was in use before the deletion: its cookie cache is warm.
    expect((await t.app.request("/v1/profile", { headers: { Cookie: elsewhere } })).status).toBe(200);

    const del = await t.app.request("/api/auth/delete-user", {
      method: "POST",
      headers: { Cookie: here, "Content-Type": "application/json", Origin: t.appOrigin },
      body: JSON.stringify({ password: t.memberA.password }),
    });
    expect(del.status).toBe(200);
    await t.drainAll();

    const request = await t.submitRequestAs({ cookie: elsewhere }, t.sampleRequestBody());
    expect(request.status).toBe(401);
    const device = await t.app.request("/v1/devices", {
      method: "POST",
      headers: { Cookie: elsewhere, "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: `ghost-${crypto.randomUUID()}`, platform: "ios", nativeToken: "ghost-token" }),
    });
    expect(device.status).toBe(401);
    const prefs = await t.app.request("/v1/profile/preferences", {
      method: "PUT",
      headers: { Cookie: elsewhere, "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: [{ category: "offers_broadcast", enabled: false }] }),
    });
    expect(prefs.status).toBe(401);
    await t.drainAll();

    const count = async (table: string) => {
      const rows: any[] = await t.db.execute(
        sql`SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE member_id = ${memberId}`,
      );
      return Number(rows[0]?.n ?? 0);
    };
    expect(await count("requests.requests")).toBe(0);
    expect(await count("notifications.device_tokens")).toBe(0);
    expect(await count("members.notification_preferences")).toBe(0);
    await t.close();
  });

  it("the facade asks for the password too: in-process calls run the same hook", async () => {
    const t = await testApp({ suite: "delete-facade" });
    const identity = t.registry.facade<any>("identity");
    await expect(identity.deleteAccount(new Headers({ Cookie: t.memberA.cookie }), "")).rejects.toMatchObject({
      body: { code: "INVALID_PASSWORD" },
    });
    const rows: any[] = await t.db.execute(sql`SELECT count(*)::int AS n FROM auth."user" WHERE id = ${t.memberA.id}`);
    expect(Number(rows[0]?.n)).toBe(1);
    await t.close();
  });
});
