import { pgSchema, text, uuid, boolean, primaryKey, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, updatedAt, tz } from "./_helpers";

export const engagement = pgSchema("engagement");
export const responseKind = engagement.enum("response_kind", ["interested", "dismissed"]);

/** One response per (offer, member) — a double tap is a no-op by constraint, not by code. */
export const offerResponses = engagement.table(
  "offer_responses",
  {
    offerId: uuid("offer_id").notNull(), // opaque (proposals schema) — no cross-schema FK
    memberId: text("member_id").notNull(),
    response: responseKind("response").notNull(),
    syncedToCrm: boolean("synced_to_crm").notNull().default(false),
    crmActivityId: text("crm_activity_id"),
    syncedAt: tz("synced_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.offerId, t.memberId] }),
    index("responses_unsynced")
      .on(t.createdAt)
      .where(sql`${t.syncedToCrm} = false AND ${t.response} = 'interested'`),
    index("responses_member").on(t.memberId, t.createdAt),
    check(
      "responses_sync_consistent",
      sql`(${t.syncedToCrm} = false) OR (${t.crmActivityId} IS NOT NULL AND ${t.syncedAt} IS NOT NULL)`,
    ),
  ],
);
