import type { Executor } from "@bbc/db";
import type { offers } from "@bbc/db/schema/proposals";

/** The row shape consumers see. Re-exported here so no consumer imports a Drizzle type directly. */
export type OfferRow = typeof offers.$inferSelect;
export type FeedCursor = { ts: Date; id: string };
export type IngestResult =
  | { ok: true; offerId: string }
  | { ok: false; code: "CONFLICT" | "BAD_KEY" }
  /** A new offer that would already be past its validity (validUntil not after now and its publishAt), or a payload
   *  the schema refuses. `details` names Zod paths when the body failed IngestInput / IngestReplayInput. */
  | { ok: false; code: "VALIDATION"; message: string; details?: { path: string; message: string }[] };
export type WithdrawResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_ACTIVE" };

/**
 * What an offer is to a member (ADR-IMPL-075), decided here once — the BFF's detail and a request made from an offer
 * read the same answer:
 * - `visible`: open, published, valid, and for them (everyone's, theirs, or their segment's);
 * - `gone`: withdrawn, expired or past its validity, and it was for them — a 410, and a request still goes through
 *   (one queued offline must not be lost);
 * - `not_yours`: for someone else, or not yet published — a 404, as if it did not exist;
 * - `missing`: no such offer.
 */
export type OfferVerdict =
  | { kind: "visible"; offer: OfferRow }
  | { kind: "gone"; offer: OfferRow }
  | { kind: "not_yours" }
  | { kind: "missing" };

/** The only import surface of @bbc/proposals. module.ts implements it; consumers import it. */
export type ProposalsFacade = {
  getVisible(exec: Executor | undefined, actorMemberId: string, offerId: string): Promise<OfferRow | null>;
  feed(
    exec: Executor | undefined,
    actorMemberId: string,
    cursor: FeedCursor | null,
    limit?: number,
  ): Promise<OfferRow[]>;
  getAny(exec: Executor | undefined, offerId: string): Promise<OfferRow | null>;
  /** One read: the offer as this member may see it (OfferVerdict). */
  verdict(exec: Executor | undefined, actorMemberId: string, offerId: string): Promise<OfferVerdict>;
  ingest(input: unknown, idempotencyKey: string): Promise<IngestResult>;
  withdraw(offerId: string, reason?: string): Promise<WithdrawResult>;
};
