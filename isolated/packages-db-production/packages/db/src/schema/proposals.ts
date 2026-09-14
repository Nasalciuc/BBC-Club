import { pgSchema, text, uuid, numeric, jsonb, char, primaryKey, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, updatedAt, tz } from "./_helpers";

export const proposals = pgSchema("proposals");

export const offerSource = proposals.enum("offer_source", ["crm_agent", "marketing_campaign"]);
export const offerTargeting = proposals.enum("offer_targeting", ["user", "segment", "broadcast"]);
export const offerStatus = proposals.enum("offer_status", ["draft", "scheduled", "active", "expired", "withdrawn"]);
export const cabinClass = proposals.enum("cabin_class", ["business", "first"]);

export type FlightFacts = {
  nonstop: boolean;
  durationMinutes: number;
  product?: string; // "Lie-flat suite"
  carrier?: string; // "BA"
  flightNumber?: string; // "BA 178"
  departLocal?: string; // "18:55"
  arriveLocal?: string; // "06:00+1"
};

export const offers = proposals.table(
  "offers",
  {
    id: id(),
    idempotencyKey: text("idempotency_key").notNull(), // S2S retry-safe
    source: offerSource("source").notNull(),
    targeting: offerTargeting("targeting").notNull(),
    targetMemberId: text("target_member_id"), // opaque; set iff targeting = 'user'
    routeFrom: char("route_from", { length: 3 }).notNull(),
    routeTo: char("route_to", { length: 3 }).notNull(),
    cabin: cabinClass("cabin").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    publishedPrice: numeric("published_price", { precision: 10, scale: 2 }),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    title: text("title").notNull(), // invitation: "Your October in London"
    body: text("body"),
    contextLine: text("context_line"), // from personalization, may be null
    flightFacts: jsonb("flight_facts").$type<FlightFacts>(),
    mediaUrl: text("media_url"), // CDN only
    mediaBlurhash: text("media_blurhash"),
    publishAt: tz("publish_at").notNull().defaultNow(),
    validUntil: tz("valid_until").notNull(),
    status: offerStatus("status").notNull().default("active"),
    createdBy: text("created_by"), // agent / campaign id (opaque)
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("offers_idempotency").on(t.idempotencyKey),
    index("offers_feed").on(t.status, t.publishAt), // feed: active, newest first
    index("offers_expiry")
      .on(t.validUntil)
      .where(sql`${t.status} = 'active'`), // expire cron
    index("offers_target_member")
      .on(t.targetMemberId)
      .where(sql`${t.targetMemberId} IS NOT NULL`),
    check("offers_price_pos", sql`${t.price} > 0`),
    check("offers_published_gte_price", sql`${t.publishedPrice} IS NULL OR ${t.publishedPrice} >= ${t.price}`),
    check("offers_valid_after_publish", sql`${t.validUntil} > ${t.publishAt}`),
    check(
      "offers_iata",
      sql`length(${t.routeFrom}) = 3 AND length(${t.routeTo}) = 3 AND ${t.routeFrom} <> ${t.routeTo}`,
    ),
    // targeting ⇔ target_member_id (true XOR on the discriminator)
    check("offers_targeting_consistent", sql`(${t.targeting} = 'user') = (${t.targetMemberId} IS NOT NULL)`),
  ],
);

/** Materialized fan-out for segment offers: exactly who was targeted (auditable). */
export const offerTargets = proposals.table(
  "offer_targets",
  {
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }), // same module → FK allowed
    memberId: text("member_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.offerId, t.memberId] }), index("offer_targets_member").on(t.memberId)],
);
