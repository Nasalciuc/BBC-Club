import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { query, queryEach, type Executor } from "@bbc/db";
import { col } from "@bbc/db/helpers";
import { requests, requestEvents } from "@bbc/db/schema/requests";

type EventRow = typeof requestEvents.$inferSelect;

/** send-requests tries a request this many times, `SEND_RETRY_MINUTES` apart; then it stops, and the member reads
 *  `not_sent` (toRequestVM). One number for both (ADR-IMPL-042). */
export const MAX_SEND_ATTEMPTS = 6;
export const SEND_RETRY_MINUTES = 5;

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
  intent: z.enum(["quote", "alternative"]).nullable(),
  replaces_fare_id: z.string().uuid().nullable(),
  fare_id: z.string().uuid().nullable(),
  offer_id: z.string().uuid().nullable(),
  /** The member's note — children's ages, a preferred time to call. The specialist's e-mail carries it. */
  note: z.string().nullable(),
  shown_estimate_amount: z.number().int().positive().nullable(),
  shown_estimate_currency: z.literal("USD").nullable(),
});
export type ClaimedRow = z.infer<typeof ClaimedRow>;

type Status = "received" | "assigned" | "quoted" | "booked" | "closed";

/** The statement `claimUnsent` runs, on its own so its plan is checked (hot-queries.test.ts: index requests_unsent).
 *  Columns come from the schema (col()): a rename cannot leave this statement behind. */
export function claimUnsentSql(limit: number) {
  const r = requests;
  return sql`
        SELECT
          ${col(r.id)}, ${col(r.reference)}, ${col(r.contactName)}, ${col(r.contactPhone)}, ${col(r.contactEmail)},
          ${col(r.legs)}, ${col(r.tripType)}, ${col(r.cabin)}, ${col(r.passengers)}, ${col(r.source)},
          ${col(r.appVersion)}, ${col(r.sendAttempts)}, ${col(r.phoneValid)}, ${col(r.phoneE164)},
          ${col(r.intent)}, ${col(r.replacesFareId)}, ${col(r.fareId)}, ${col(r.offerId)}, ${col(r.note)},
          ${col(r.shownEstimateAmount)}, ${col(r.shownEstimateCurrency)}
        FROM ${r}
        WHERE ${col(r.sentToCrm)} = false
          AND ${col(r.sendAttempts)} < ${MAX_SEND_ATTEMPTS}
          AND ${col(r.status)} <> 'closed'
          AND (${col(r.sentAt)} IS NULL OR ${col(r.sentAt)} < now() - interval '${sql.raw(String(SEND_RETRY_MINUTES))} minutes')
        ORDER BY ${col(r.createdAt)}
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}`;
}

/** Ownership is in the WHERE. Someone else's request returns undefined → route 404. */
export function createRequestsRepo(db: Executor) {
  return {
    /** Requests in progress first, newest first within each group: past the 50 the list shows, an older request still
     *  in progress must not drop off while finished ones fill the page. The first key is written exactly as the second
     *  key of `requests_member_list` (0025) — false sorts first — so the read stops at 51 index entries; changing one
     *  without the other turns it into a read of every request the member has (hot-queries.test.ts). */
    listForMemberSelect(exec: Executor | undefined, memberId: string) {
      return (exec ?? db)
        .select()
        .from(requests)
        .where(eq(requests.memberId, memberId))
        .orderBy(sql`(${requests.status} IN ('booked', 'closed'))`, desc(requests.createdAt))
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

    /** Claims unsent requests. FOR UPDATE SKIP LOCKED so two workers never take the same row. A closed request is not
     *  sent: a deleted member's rows are closed and redacted, and an operator has nothing to call. A row that does not
     *  read is not sent either: it is counted as a failed attempt (so the member reads `not_sent` after six) and
     *  returned in `rejected` — one bad row never stops the batch. */
    async claimUnsent(
      tx: Executor,
      limit = 20,
    ): Promise<{ rows: ClaimedRow[]; rejected: { id: string | null; reason: string; attempts: number }[] }> {
      const { rows, rejected } = await queryEach(tx, claimUnsentSql(limit), ClaimedRow);
      const bad: { id: string | null; reason: string; attempts: number }[] = [];
      for (const reject of rejected) {
        const raw = (reject.raw as { id?: unknown } | null)?.id;
        const id = typeof raw === "string" ? raw : null;
        const reason = `row shape: ${reject.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`.slice(
          0,
          500,
        );
        const attempts = id ? await this.markFailed(tx, id, reason) : 0;
        bad.push({ id, reason, attempts });
      }
      return { rows, rejected: bad };
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

    /** One failed attempt. Returns the attempts made so far, so the job knows when it has just given up. */
    async markFailed(tx: Executor, id: string, error: string): Promise<number> {
      const [row] = await tx
        .update(requests)
        .set({
          lastError: error,
          sentAt: sql`now()`,
          sendAttempts: sql`${requests.sendAttempts} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(requests.id, id))
        .returning({ attempts: requests.sendAttempts });
      return row?.attempts ?? 0;
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
