import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { query, type Executor } from "@bbc/db";
import { col } from "@bbc/db/helpers";
import { requests, requestEvents } from "@bbc/db/schema/requests";

type EventRow = typeof requestEvents.$inferSelect;

/** One request claimed for the CRM send (claimUnsent). Validated where it is read. */
export const ClaimedRow = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  contact_name: z.string(),
  contact_phone: z.string().min(7),
  contact_email: z.string(),
  legs: z.array(z.object({ from: z.string(), to: z.string(), date: z.string() })),
  trip_type: z.string(),
  cabin: z.string(),
  passengers: z.object({
    adult: z.coerce.number(),
    child: z.coerce.number(),
    infant: z.coerce.number(),
  }),
  source: z.string(),
  app_version: z.string().nullable(),
  send_attempts: z.coerce.number().int(),
  phone_valid: z.coerce.boolean(),
  phone_e164: z.string().nullable(),
});
export type ClaimedRow = z.infer<typeof ClaimedRow>;

type Status = "received" | "assigned" | "quoted" | "booked" | "closed";

/** Ownership is in the WHERE. Someone else's request returns undefined → route 404. */
export function createRequestsRepo(db: Executor) {
  return {
    listForMemberSelect(exec: Executor | undefined, memberId: string) {
      return (exec ?? db)
        .select()
        .from(requests)
        .where(eq(requests.memberId, memberId))
        .orderBy(desc(requests.createdAt))
        .limit(51);
    },

    async listForMember(exec: Executor | undefined, memberId: string) {
      return this.listForMemberSelect(exec, memberId);
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

    /** One indexed read for a page of requests. Empty ids skip the query. */
    async timelinesFor(exec: Executor | undefined, ids: readonly string[]): Promise<Map<string, EventRow[]>> {
      if (ids.length === 0) return new Map();
      const rows = await (exec ?? db)
        .select()
        .from(requestEvents)
        .where(inArray(requestEvents.requestId, [...ids]))
        .orderBy(requestEvents.createdAt);
      const byId = new Map<string, EventRow[]>();
      for (const row of rows) {
        const list = byId.get(row.requestId);
        if (list) list.push(row);
        else byId.set(row.requestId, [row]);
      }
      return byId;
    },

    /** Claims unsent requests. FOR UPDATE SKIP LOCKED so two workers never take the same row. */
    async claimUnsent(tx: Executor, limit = 20): Promise<ClaimedRow[]> {
      const r = requests; // columns from the schema (col()): a rename cannot leave this statement behind
      return query(
        tx,
        sql`
        SELECT
          ${col(r.id)}, ${col(r.reference)}, ${col(r.contactName)}, ${col(r.contactPhone)}, ${col(r.contactEmail)},
          ${col(r.legs)}, ${col(r.tripType)}, ${col(r.cabin)}, ${col(r.passengers)}, ${col(r.source)},
          ${col(r.appVersion)}, ${col(r.sendAttempts)}, ${col(r.phoneValid)}, ${col(r.phoneE164)}
        FROM ${r}
        WHERE ${col(r.sentToCrm)} = false
          AND ${col(r.sendAttempts)} < 6
          AND (${col(r.sentAt)} IS NULL OR ${col(r.sentAt)} < now() - interval '5 minutes')
        ORDER BY ${col(r.createdAt)}
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}`,
        ClaimedRow,
      );
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
