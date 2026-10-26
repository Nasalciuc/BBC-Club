import {
  pgSchema,
  text,
  jsonb,
  integer,
  bigserial,
  bigint,
  timestamp,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const platform = pgSchema("platform");

export const deliveryStatus = platform.enum("delivery_status", ["pending", "done", "dead", "paused"]);
/** Labels read from the database (`enum_range(NULL::platform.…)`), created by 0001_extras.sql. */
export const externalSource = platform.enum("external_source", ["crm", "postmark", "ses", "push", "expo", "unknown"]);
export const jobRunStatus = platform.enum("job_run_status", ["running", "succeeded", "failed", "skipped"]);

/** Append-only journal. Partitioned monthly on occurred_at (see migrations/0001_extras.sql).
 *  payload carries facts, never secrets; member_id is tombstoned on account deletion. */
export const domainEvents = platform.table(
  "domain_events",
  {
    id: bigserial("id", { mode: "bigint" }).notNull(),
    type: text("type").notNull(),
    version: integer("version").notNull().default(1),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    memberId: text("member_id"),
    payload: jsonb("payload").notNull(),
    publishedBy: text("published_by").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.occurredAt] }), // partition key must be in the PK
    // Named by Postgres when 0001_extras.sql partitioned the journal (CREATE TABLE … LIKE … INCLUDING ALL gives
    // copied indexes default names). These are the names in every database — do not rename.
    index("domain_events_type_id_idx").on(t.type, t.id),
    index("domain_events_aggregate_type_aggregate_id_id_idx").on(t.aggregateType, t.aggregateId, t.id),
    index("domain_events_member_id_idx")
      .on(t.memberId)
      .where(sql`${t.memberId} IS NOT NULL`),
    check("domain_events_version_pos", sql`${t.version} >= 1`),
  ],
);

/** One row per (event, consumer), written in the SAME transaction as the event.
 *  This is why there is no global cursor and therefore no sequence-gap problem. */
export const eventDeliveries = platform.table(
  "event_deliveries",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    eventId: bigint("event_id", { mode: "bigint" }).notNull(), // reference — never auto-generated
    eventOccurredAt: timestamp("event_occurred_at", { withTimezone: true }).notNull(), // to reach the right partition
    consumer: text("consumer").notNull(),
    aggregateId: text("aggregate_id").notNull(), // per-aggregate ordering
    status: deliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deliveries_event_consumer").on(t.eventId, t.consumer), // exactly one delivery per consumer per event
    index("deliveries_ready")
      .on(t.runAfter, t.id)
      .where(sql`${t.status} = 'pending'`),
    index("deliveries_consumer_status").on(t.consumer, t.status),
    index("deliveries_cleanup")
      .on(t.processedAt)
      .where(sql`${t.status} = 'done'`),
    index("deliveries_pending_created")
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    index("deliveries_dead")
      .on(t.id)
      .where(sql`${t.status} = 'dead'`),
    index("deliveries_paused")
      .on(t.id)
      .where(sql`${t.status} = 'paused'`),
    check("deliveries_attempts_nonneg", sql`${t.attempts} >= 0`),
  ],
);

/** Dead letters: a delivery that exhausted its retries. Kept until a human replays or discards it. */
export const eventDlq = platform.table(
  "event_dlq",
  {
    deliveryId: bigint("delivery_id", { mode: "bigint" }).primaryKey(), // = event_deliveries.id — supplied, not generated
    eventId: bigint("event_id", { mode: "bigint" }).notNull(),
    consumer: text("consumer").notNull(),
    attempts: integer("attempts").notNull(),
    lastError: text("last_error").notNull(),
    failedAt: timestamp("failed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dlq_consumer").on(t.consumer, t.failedAt)],
);

/** Idempotency for events arriving from OUTSIDE (webhooks): the id is theirs, not ours. */
export const externalInbox = platform.table(
  "external_inbox",
  {
    source: externalSource("source").notNull(),
    externalId: text("external_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.source, t.externalId] })],
);

export const flags = platform.table("flags", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobRuns = platform.table(
  "job_runs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    job: text("job").notNull(),
    status: jobRunStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    metrics: jsonb("metrics").$type<Record<string, number>>(),
    error: text("error"),
  },
  (t) => [index("job_runs_job_started").on(t.job, t.startedAt)],
);

/** GCRA state. One theoretical arrival time per key. The old rate_limits table stays unused after A3. */
export const rateLimitState = platform.table(
  "rate_limit_state",
  {
    key: text("key").primaryKey(),
    tat: timestamp("tat", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limit_state_tat").on(t.tat)],
);

/** Kafka consumer idempotency. event_id is text: a journal id, or topic:partition:offset. */
export const kafkaProcessed = platform.table(
  "kafka_processed",
  {
    consumer: text("consumer").notNull(),
    eventId: text("event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.consumer, t.eventId] })],
);

export const rateLimits = platform.table(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_expires").on(t.expiresAt), check("rate_limits_nonneg", sql`${t.count} >= 0`)],
);
