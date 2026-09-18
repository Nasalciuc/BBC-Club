import { and, desc, eq, sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { requests, requestEvents } from "@bbc/db/schema/requests";

type Status = "received" | "assigned" | "quoted" | "booked" | "closed";

/** Ownership is in the WHERE. Someone else's request returns undefined → route 404. */
export function createRequestsRepo(db: Executor) {
  return {
    async listForMember(exec: Executor | undefined, memberId: string) {
      return (exec ?? db)
        .select()
        .from(requests)
        .where(eq(requests.memberId, memberId))
        .orderBy(desc(requests.createdAt))
        .limit(51);
    },

    async getForMember(exec: Executor | undefined, memberId: string, id: string) {
      const [row] = await (exec ?? db)
        .select()
        .from(requests)
        .where(and(eq(requests.id, id), eq(requests.memberId, memberId)))
        .limit(1);
      return row;
    },

    async getById(exec: Executor | undefined, id: string) {
      const [row] = await (exec ?? db).select().from(requests).where(eq(requests.id, id)).limit(1);
      return row;
    },

    async timeline(exec: Executor | undefined, requestId: string) {
      return (exec ?? db)
        .select()
        .from(requestEvents)
        .where(eq(requestEvents.requestId, requestId))
        .orderBy(requestEvents.createdAt);
    },

    /** Claims unsent requests. FOR UPDATE SKIP LOCKED so two workers never take the same row. */
    async claimUnsent(tx: Executor, limit = 20) {
      return tx.execute(sql`
        SELECT
          id,
          reference,
          contact_name,
          contact_phone,
          contact_email,
          legs,
          trip_type,
          cabin,
          passengers,
          source,
          app_version,
          send_attempts,
          phone_valid,
          phone_e164
        FROM requests.requests
        WHERE sent_to_crm = false
          AND send_attempts < 6
          AND (sent_at IS NULL OR sent_at < now() - interval '5 minutes')
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}`);
    },

    async markSent(tx: Executor, id: string, crmRequestId: string) {
      await tx
        .update(requests)
        .set({
          sentToCrm: true,
          crmRequestId,
          sentAt: sql`now()`,
          lastError: null,
          updatedAt: sql`now()`,
        })
        .where(eq(requests.id, id));
    },

    async markFailed(tx: Executor, id: string, error: string) {
      await tx
        .update(requests)
        .set({
          lastError: error,
          sentAt: sql`now()`,
          sendAttempts: sql`${requests.sendAttempts} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(requests.id, id));
    },

    async setStatus(tx: Executor, id: string, status: Status, note: string | null, actor: string | null) {
      const [row] = await tx
        .update(requests)
        .set({ status, updatedAt: sql`now()` })
        .where(eq(requests.id, id))
        .returning();
      if (!row) return null;
      await tx.insert(requestEvents).values({ requestId: id, status, note, actor });
      return row;
    },
  };
}

export type RequestsRepo = ReturnType<typeof createRequestsRepo>;
