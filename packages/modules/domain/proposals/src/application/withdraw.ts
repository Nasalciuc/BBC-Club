import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import { offers } from "@bbc/db/schema/proposals";
import { event } from "@bbc/shared/events";

export type WithdrawDeps = {
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

/** Idempotent: only an active offer is withdrawn and emits offer.withdrawn once. */
export async function withdraw(
  deps: WithdrawDeps,
  offerId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_ACTIVE" }> {
  return withTx(deps.db, async (tx) => {
    const now = new Date();
    const updated = await tx
      .update(offers)
      .set({ status: "withdrawn", updatedAt: sql`now()` })
      .where(and(eq(offers.id, offerId), eq(offers.status, "active")))
      .returning({ id: offers.id });
    if (!updated[0]) {
      const [row] = await tx.select({ id: offers.id }).from(offers).where(eq(offers.id, offerId)).limit(1);
      return { ok: false, code: row ? "NOT_ACTIVE" : "NOT_FOUND" };
    }
    await deps.events.publish(tx, {
      type: "offer.withdrawn",
      version: 1,
      aggregateType: "offer",
      aggregateId: offerId,
      memberId: null,
      payload: event("offer.withdrawn", {
        offerId,
        withdrawnAt: now.toISOString(),
        ...(reason ? { reason } : {}),
      }),
    });
    return { ok: true };
  });
}
