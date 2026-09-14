import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { offerResponses } from "@bbc/db/schema/engagement";

/** Every method takes the actor explicitly. There is no method that reads or writes across members. */
export const responsesRepo = {
  /** Idempotent upsert: same response twice → no-op (0 rows changed); "dismissed" after "interested" → updated. Returns the stored state. */
  async upsert(exec: Executor, actorMemberId: string, offerId: string, response: "interested" | "dismissed") {
    const rows = await exec
      .insert(offerResponses)
      .values({ offerId, memberId: actorMemberId, response })
      .onConflictDoUpdate({
        target: [offerResponses.offerId, offerResponses.memberId],
        set: { response, updatedAt: sql`now()` },
        setWhere: sql`${offerResponses.response} <> excluded.response`,
      })
      .returning({ response: offerResponses.response, createdAt: offerResponses.createdAt });
    // onConflict with a false setWhere returns no row → read the existing one (still scoped by actor)
    return rows[0] ?? (await this.get(exec, actorMemberId, offerId));
  },
  async get(exec: Executor, actorMemberId: string, offerId: string) {
    const [row] = await exec
      .select({ response: offerResponses.response, createdAt: offerResponses.createdAt })
      .from(offerResponses)
      .where(and(eq(offerResponses.offerId, offerId), eq(offerResponses.memberId, actorMemberId))) // ← ownership is the query
      .limit(1);
    return row ?? null;
  },
};
