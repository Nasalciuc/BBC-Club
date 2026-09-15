import { and, eq, lt, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import { offers } from "@bbc/db/schema/proposals";
import { event } from "@bbc/shared/events";

export type ExpireDeps = {
  db: Executor;
  events: {
    publish(
      tx: Executor,
      e: {
        type: string;
        version: number;
        aggregateType: string;
        aggregateId: string;
        memberId?: string | null;
        payload: unknown;
      },
    ): Promise<unknown>;
  };
};

/** Idempotent: marks active offers past validUntil as expired and emits offer.expired per offer.
 *  Safe to run multiple times -- the WHERE clause ensures only active offers are touched. */
export async function expireOffers(deps: ExpireDeps): Promise<{ expired: number }> {
  return withTx(deps.db, async (tx) => {
    const now = new Date();
    const expired = await tx
      .update(offers)
      .set({ status: "expired", updatedAt: sql`now()` })
      .where(and(eq(offers.status, "active"), lt(offers.validUntil, now)))
      .returning({ id: offers.id });

    for (const row of expired) {
      await deps.events.publish(tx, {
        type: "offer.expired",
        version: 1,
        aggregateType: "offer",
        aggregateId: row.id,
        memberId: null,
        payload: event("offer.expired", {
          offerId: row.id,
          expiredAt: now.toISOString(),
        }),
      });
    }
    return { expired: expired.length };
  });
}
