import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { createPersonalizationFacade } from "../../src/api";

describe("@bbc/personalization facade", () => {
  it("redactMember deletes features and candidates for that member only", async () => {
    const iso = await isolatedDb("pers-facade");
    const a = `mem-a-${crypto.randomUUID()}`;
    const b = `mem-b-${crypto.randomUUID()}`;
    try {
      await iso.db.execute(
        sql`INSERT INTO personalization.member_features (member_id, features) VALUES (${a}, '{}'::jsonb), (${b}, '{}'::jsonb)`,
      );
      await iso.db.execute(sql`
        INSERT INTO personalization.proposal_candidates (member_id, offer_draft, score, reasons, ranker_version)
        VALUES
          (${a}, '{}'::jsonb, 0.5, '["route"]'::jsonb, 'rules-v1'),
          (${b}, '{}'::jsonb, 0.4, '["route"]'::jsonb, 'rules-v1')`);
      const facade = createPersonalizationFacade(iso.db);
      await facade.redactMember(undefined, a);

      const [{ n }]: any = await iso.db.execute(
        sql`SELECT count(*)::int n FROM personalization.member_features WHERE member_id = ${a}`,
      );
      const [{ n: nb }]: any = await iso.db.execute(
        sql`SELECT count(*)::int n FROM personalization.member_features WHERE member_id = ${b}`,
      );
      const [{ n: c }]: any = await iso.db.execute(
        sql`SELECT count(*)::int n FROM personalization.proposal_candidates WHERE member_id = ${a}`,
      );
      expect(n).toBe(0);
      expect(nb).toBe(1);
      expect(c).toBe(0);
    } finally {
      await iso.drop();
    }
  });
});
