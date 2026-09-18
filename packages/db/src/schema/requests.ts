import { pgSchema, text, uuid, char, integer, jsonb, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, updatedAt, tz } from "./_helpers";

/** Schema and table cannot share a name — same pattern as proposals/offers. */
export const requestsSchema = pgSchema("requests");
export const requestStatus = requestsSchema.enum("request_status", [
  "received",
  "assigned",
  "quoted",
  "booked",
  "closed",
]);
export const tripType = requestsSchema.enum("trip_type", ["round", "oneway", "multi"]);
export const requestCabin = requestsSchema.enum("request_cabin", ["business", "first"]);
export const requestSource = requestsSchema.enum("request_source", ["ios", "android"]);

export type RequestLeg = { from: string; to: string; date: string };
export type Passengers = { adult: number; child: number; infant: number };

export const requests = requestsSchema.table(
  "requests",
  {
    id: id(),
    reference: text("reference").notNull(),
    memberId: text("member_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    fareId: uuid("fare_id"),
    offerId: uuid("offer_id"),
    tripType: tripType("trip_type").notNull(),
    cabin: requestCabin("cabin").notNull(),
    legs: jsonb("legs").$type<RequestLeg[]>().notNull(),
    passengers: jsonb("passengers").$type<Passengers>().notNull(),
    priceAtRequest: text("price_at_request"),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email").notNull(),
    note: text("note"),
    status: requestStatus("status").notNull().default("received"),
    source: requestSource("source").notNull(),
    appVersion: text("app_version"),
    sentToCrm: boolean("sent_to_crm").notNull().default(false),
    crmRequestId: text("crm_request_id"),
    sentAt: tz("sent_at"),
    lastError: text("last_error"),
    /** Job send attempts; Gate 3 stops after six. Expand-only vs THE BUILD §5.1. */
    sendAttempts: integer("send_attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("requests_idempotency").on(t.idempotencyKey),
    uniqueIndex("requests_reference").on(t.reference),
    index("requests_member")
      .on(t.memberId, t.createdAt)
      .where(sql`${t.memberId} IS NOT NULL`),
    index("requests_unsent")
      .on(t.createdAt)
      .where(sql`${t.sentToCrm} = false`),
    index("requests_open")
      .on(t.status)
      .where(sql`${t.status} <> 'closed' AND ${t.status} <> 'booked'`),
    index("requests_fare")
      .on(t.fareId)
      .where(sql`${t.fareId} IS NOT NULL`),
    index("requests_offer")
      .on(t.offerId)
      .where(sql`${t.offerId} IS NOT NULL`),
    index("requests_crm")
      .on(t.crmRequestId)
      .where(sql`${t.crmRequestId} IS NOT NULL`),
    check("requests_legs_nonempty", sql`jsonb_array_length(${t.legs}) >= 1`),
    check("requests_one_source", sql`NOT (${t.fareId} IS NOT NULL AND ${t.offerId} IS NOT NULL)`),
    check(
      "requests_sync_consistent",
      sql`(${t.sentToCrm} = false) OR (${t.crmRequestId} IS NOT NULL AND ${t.sentAt} IS NOT NULL)`,
    ),
    check(
      "requests_contact",
      sql`length(${t.contactName}) > 1 AND length(${t.contactPhone}) > 6 AND position('@' in ${t.contactEmail}) > 1`,
    ),
  ],
);

export const requestEvents = requestsSchema.table(
  "request_events",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    status: requestStatus("status").notNull(),
    note: text("note"),
    actor: text("actor"),
    createdAt: createdAt(),
  },
  (t) => [index("request_events_request").on(t.requestId, t.createdAt)],
);
