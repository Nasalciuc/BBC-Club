import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

/** Host integration: account deletion cascades across schemas via member.deleted consumers. */
describe("account deletion — zero rows everywhere", () => {
  it("removes auth rows, cascades our schemas via member.deleted, tombstones the journal", async () => {
    const t = await testApp({ suite: "delete" });
    const email = t.memberA.email;
    const memberId = t.memberA.id;

    await t.seedMemberData(memberId);
    const offerId = await t.seedBroadcastOffer();
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

    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string };

    const identity = t.registry.facade<any>("identity");
    await identity.deleteAccount(new Headers({ Cookie: t.memberA.cookie }));
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
    expect(await count("notifications", "device_tokens", "member_id")).toBe(0);
    expect(await count("notifications", "notifications", "member_id")).toBe(0);
    expect(await count("engagement", "offer_responses", "member_id")).toBe(0);
    expect(await count("requests", "requests", "member_id")).toBe(0);
    expect(await count("proposals", "offer_targets", "member_id")).toBe(0);
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
