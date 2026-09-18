import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { onMemberDeleted } from "../../src/handlers/on-member-deleted";

describe("requests.onMemberDeleted", () => {
  it("redacts contact fields and nulls member_id", async () => {
    const iso = await isolatedDb("req-deleted");
    const memberId = `mem-${crypto.randomUUID()}`;
    try {
      const [{ id }]: any = await iso.db.execute(sql`
        INSERT INTO requests.requests (
          reference, member_id, idempotency_key, trip_type, cabin, legs, passengers,
          contact_name, contact_phone, contact_email, status, source
        ) VALUES (
          ${"R-" + memberId.slice(0, 8)}, ${memberId}, ${"idem-" + memberId},
          'oneway', 'business',
          '[{"from":"JFK","to":"LHR","date":"2026-10-12"}]'::jsonb,
          '{"adult":1,"child":0,"infant":0}'::jsonb,
          'Alex Morgan', '+12125550148', 'alex@test.dev',
          'received', 'ios'
        ) RETURNING id`);
      await iso.db.transaction((tx: any) =>
        onMemberDeleted(
          { tx, memberId },
          { type: "member.deleted", version: 1, memberId, deletedAt: new Date().toISOString() },
        ),
      );
      const [row]: any = await iso.db.execute(
        sql`SELECT member_id, contact_name, contact_email, contact_phone, status FROM requests.requests WHERE id = ${id}`,
      );
      expect(row.member_id).toBeNull();
      expect(row.contact_name).toBe("[deleted]");
      expect(row.contact_email).toBe("deleted@invalid");
      expect(row.contact_phone).toBe("+0000000");
      expect(row.status).toBe("closed");
      const [{ n }]: any = await iso.db.execute(
        sql`SELECT count(*)::int n FROM requests.request_events WHERE request_id = ${id} AND note = 'account deleted'`,
      );
      expect(n).toBe(1);
    } finally {
      await iso.drop();
    }
  });
});
