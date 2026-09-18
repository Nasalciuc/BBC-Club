import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { onMemberDeleted } from "../../src/handlers/on-member-deleted";

describe("personalization.onMemberDeleted", () => {
  it("wipes features and candidates for the deleted member", async () => {
    const iso = await isolatedDb("pers-deleted");
    const memberId = `mem-${crypto.randomUUID()}`;
    try {
      await iso.db.execute(
        sql`INSERT INTO personalization.member_features (member_id, features) VALUES (${memberId}, '{}'::jsonb)`,
      );
      await iso.db.execute(sql`
        INSERT INTO personalization.proposal_candidates (member_id, offer_draft, score, reasons, ranker_version)
        VALUES (${memberId}, '{"title":"x"}'::jsonb, 0.8, '["home"]'::jsonb, 'rules-v1')`);
      await onMemberDeleted(
        { tx: iso.db, memberId },
        { type: "member.deleted", version: 1, memberId, deletedAt: new Date().toISOString() },
      );
      const [{ n }]: any = await iso.db.execute(
        sql`SELECT count(*)::int n FROM personalization.member_features WHERE member_id = ${memberId}`,
      );
      const [{ n: c }]: any = await iso.db.execute(
        sql`SELECT count(*)::int n FROM personalization.proposal_candidates WHERE member_id = ${memberId}`,
      );
      expect(n).toBe(0);
      expect(c).toBe(0);
    } finally {
      await iso.drop();
    }
  });
});
