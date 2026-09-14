import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

/** Host integration: account deletion cascades across schemas via member.deleted consumers. */
describe("account deletion — zero rows everywhere", () => {
  it("removes auth rows, cascades our schemas via member.deleted, tombstones the journal", async () => {
    const t = await testApp();
    const email = t.memberA.email;
    const memberId = t.memberA.id;

    await t.seedMemberData(memberId);
    const offerId = crypto.randomUUID();
    await t.db.execute(sql`
      INSERT INTO engagement.offer_responses (offer_id, member_id, response)
      VALUES (${offerId}::uuid, ${memberId}, 'interested')
      ON CONFLICT DO NOTHING`);

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
    expect(await count("notifications", "device_tokens", "member_id")).toBe(0);
    expect(await count("notifications", "notifications", "member_id")).toBe(0);
    expect(await count("engagement", "offer_responses", "member_id")).toBe(0);

    const tombstoned = await t.journal.forMember(memberId);
    expect(tombstoned.every((e) => !JSON.stringify(e.payload).includes(email))).toBe(true);
    await t.close();
  });
});
