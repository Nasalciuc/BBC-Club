import { pgSchema, text, uuid, jsonb, numeric, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, tz } from "./_helpers";

export const personalization = pgSchema("personalization");
export const candidateStatus = personalization.enum("candidate_status", ["suggested", "accepted", "rejected", "expired"]);

export type MemberFeatures = {
  routes: { from: string; to: string; count: number; lastAt: string }[];
  cabinPreference?: "business" | "first";
  seasonality?: number[];           // 12 months, 0..1
  priceBand?: { min: number; max: number };
  responseRate?: number;            // interested / delivered
  lastInteractionAt?: string;
};

/** Nightly-materialized feature store (from crm.mirror + platform.domain_events). */
export const memberFeatures = personalization.table("member_features", {
  memberId: text("member_id").primaryKey(),
  features: jsonb("features").$type<MemberFeatures>().notNull(),
  computedAt: tz("computed_at").notNull().defaultNow(),
});

/** Agent-in-the-loop: the ranker proposes, the advisor decides; rejections are training signal. */
export const proposalCandidates = personalization.table("proposal_candidates", {
  id: id(),
  memberId: text("member_id").notNull(),
  offerDraft: jsonb("offer_draft").notNull(),                     // validated by the offers Zod schema before insert
  score: numeric("score", { precision: 6, scale: 4 }).notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull(),          // become the card's context line
  rankerVersion: text("ranker_version").notNull(),                // "rules-v1" | "model-2026-11"
  status: candidateStatus("status").notNull().default("suggested"),
  publishedOfferId: uuid("published_offer_id"),                   // set when accepted → offers.id (opaque)
  decidedBy: text("decided_by"),
  decidedAt: tz("decided_at"),
  createdAt: createdAt(),
}, (t) => [
  index("candidates_member_status").on(t.memberId, t.status),
  index("candidates_open").on(t.createdAt).where(sql`${t.status} = 'suggested'`),
  check("candidates_score_range", sql`${t.score} BETWEEN 0 AND 1`),
  check("candidates_decided_consistent", sql`(${t.status} = 'suggested') = (${t.decidedAt} IS NULL)`),
  check("candidates_accepted_has_offer", sql`${t.status} <> 'accepted' OR ${t.publishedOfferId} IS NOT NULL`),
]);
