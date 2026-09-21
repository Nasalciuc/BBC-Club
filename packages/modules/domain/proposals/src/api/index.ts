import type { Executor } from "@bbc/db";
import type { offers } from "@bbc/db/schema/proposals";

/** The row shape consumers see. Re-exported here so no consumer imports a Drizzle type directly. */
export type OfferRow = typeof offers.$inferSelect;
export type FeedCursor = { ts: Date; id: string };
export type IngestResult = { ok: true; offerId: string } | { ok: false; code: "CONFLICT" | "BAD_KEY" };
export type WithdrawResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_ACTIVE" };

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
  ingest(input: unknown, idempotencyKey: string): Promise<IngestResult>;
  withdraw(offerId: string, reason?: string): Promise<WithdrawResult>;
};
