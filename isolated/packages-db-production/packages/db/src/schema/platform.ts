import { pgSchema, text, jsonb, integer, bigserial, timestamp, boolean, primaryKey, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, tz } from "./_helpers";

export const platform = pgSchema("platform");

/** Append-only integration-event journal. Partitioned monthly (raw SQL in migration 0001).
 *  Producers insert inside their own transaction (outbox). Payload never carries PII beyond ids;
 *  member deletion tombstones payloads (member.deleted handler). */
export const domainEvents = platform.table("domain_events", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),          // ordering per aggregate
  type: text("type").notNull(),                                   // "offer.published"
  version: integer("version").notNull().default(1),               // schema version (packages/shared/events)
  aggregateType: text("aggregate_type").notNull(),                // "offer" | "member" | ...
  aggregateId: text("aggregate_id").notNull(),                    // opaque id, no FK
  memberId: text("member_id"),                                    // opaque; nullable
  payload: jsonb("payload").notNull(),
  publishedBy: text("published_by").notNull(),                    // module name
  occurredAt: createdAt(),
}, (t) => [
  index("domain_events_type_id").on(t.type, t.id),
  index("domain_events_aggregate").on(t.aggregateType, t.aggregateId, t.id),
  index("domain_events_member").on(t.memberId).where(sql`${t.memberId} IS NOT NULL`),
  check("domain_events_version_pos", sql`${t.version} >= 1`),
]);

/** One row per consumer: where it is in the journal. */
export const eventCursors = platform.table("event_cursors", {
  consumer: text("consumer").primaryKey(),                        // "notifications.onOfferPublished"
  lastEventId: bigserial("last_event_id", { mode: "bigint" }).notNull(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

/** Idempotency: (consumer, event) processed exactly once. */
export const eventInbox = platform.table("event_inbox", {
  consumer: text("consumer").notNull(),
  eventId: bigserial("event_id", { mode: "bigint" }).notNull(),
  processedAt: createdAt(),                                       // inserted in the SAME tx as the effect
}, (t) => [primaryKey({ columns: [t.consumer, t.eventId] })]);

export const eventDlq = platform.table("event_dlq", {
  consumer: text("consumer").notNull(),
  eventId: bigserial("event_id", { mode: "bigint" }).notNull(),
  attempts: integer("attempts").notNull(),
  lastError: text("last_error").notNull(),
  failedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.consumer, t.eventId] })]);

/** Feature flags + killswitches. Read through an in-process cache (TTL 30 s). */
export const flags = platform.table("flags", {
  key: text("key").primaryKey(),                                  // "personalization.ranker"
  value: jsonb("value").notNull(),                                // {"enabled":true,"variant":"rules"}
  description: text("description"),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

/** Fixed-window counters; fail-closed on error at the call site. */
export const rateLimits = platform.table("rate_limits", {
  key: text("key").primaryKey(),                                  // "otp:email:<hash>"
  windowStart: tz("window_start").notNull(),
  count: integer("count").notNull().default(1),
  expiresAt: tz("expires_at").notNull(),                          // cleanup cron deletes expired rows
}, (t) => [
  index("rate_limits_expires").on(t.expiresAt),
  check("rate_limits_nonneg", sql`${t.count} >= 0`),
]);
