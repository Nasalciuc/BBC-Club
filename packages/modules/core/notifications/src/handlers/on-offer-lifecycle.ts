import { and, eq, inArray, sql } from "drizzle-orm";
import { eqConst, inConst } from "@bbc/db/helpers";
import { OfferExpiredV1, OfferWithdrawnV1 } from "@bbc/shared/events/offer";
import { campaigns, notificationsTable } from "@bbc/db/schema/notifications";
import type { Executor } from "@bbc/db";

/** A withdrawn/expired offer is never pushed: its open campaign stops, and pending rows are suppressed. */
export async function onOfferWithdrawn(deps: { tx: Executor }, raw: unknown): Promise<void> {
  const evt = OfferWithdrawnV1.parse(raw);
  await stopOffer(deps.tx, evt.offerId, "offer_withdrawn");
}

export async function onOfferExpired(deps: { tx: Executor }, raw: unknown): Promise<void> {
  const evt = OfferExpiredV1.parse(raw);
  await stopOffer(deps.tx, evt.offerId, "offer_expired");
}

async function stopOffer(tx: Executor, offerId: string, reason: string): Promise<void> {
  // The campaign first: a fan-out page locks this row before it writes, so once this commits no page adds rows —
  // and a page that committed first has its rows suppressed below (each statement sees what committed before it).
  await tx
    .update(campaigns)
    .set({ status: "done", finishedAt: sql`now()`, lastMemberId: null })
    .where(and(eq(campaigns.offerId, offerId), inConst(campaigns.status, ["pending", "running"])));
  await tx
    .update(notificationsTable)
    .set({ status: "suppressed", lastError: reason })
    .where(and(eq(notificationsTable.offerId, offerId), eqConst(notificationsTable.status, "pending")));
}
