import { and, eq, inArray } from "drizzle-orm";
import { OfferExpiredV1, OfferWithdrawnV1 } from "@bbc/shared/events/offer";
import { notificationsTable } from "@bbc/db/schema/notifications";

/** Pending push rows for a withdrawn/expired offer are suppressed — never sent. */
export async function onOfferWithdrawn(deps: { tx: any }, raw: unknown): Promise<void> {
  const evt = OfferWithdrawnV1.parse(raw);
  await suppressPendingForOffer(deps.tx, evt.offerId, "offer_withdrawn");
}

export async function onOfferExpired(deps: { tx: any }, raw: unknown): Promise<void> {
  const evt = OfferExpiredV1.parse(raw);
  await suppressPendingForOffer(deps.tx, evt.offerId, "offer_expired");
}

async function suppressPendingForOffer(tx: any, offerId: string, reason: string): Promise<void> {
  await tx
    .update(notificationsTable)
    .set({ status: "suppressed", lastError: reason })
    .where(and(eq(notificationsTable.offerId, offerId), inArray(notificationsTable.status, ["pending"])));
}
