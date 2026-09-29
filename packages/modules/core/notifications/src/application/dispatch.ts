import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { query, withTx, type Executor } from "@bbc/db";
import { col } from "@bbc/db/helpers";
import { event } from "@bbc/shared/events";
import { notificationsTable, deviceTokens } from "@bbc/db/schema/notifications";
import type { MembersFacade } from "@bbc/members";
import type { PushSender } from "../ports/push";

export const CLAIM = 100;
const CONCURRENCY = 20;

const PendingRow = z.object({
  id: z.string().uuid(),
  member_id: z.string(),
  category: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  deep_link: z.string().nullable(),
  offer_id: z.string().nullable(),
  attempts: z.coerce.number().int(),
});
type PendingRow = z.infer<typeof PendingRow>;
const ReclaimedRow = z.object({ id: z.string().uuid() });
/** Columns in hand-written SQL come from the schema (col()), so a rename cannot leave a statement behind. */
const N = notificationsTable;

/** Same reaper UPDATE the dispatcher runs — hot-query tests EXPLAIN this. */
export function dispatchReaperSql(stuck: SQL) {
  return sql`
      UPDATE ${N}
      SET
        ${col(N.attempts)} = ${col(N.attempts)} + 1,
        ${col(N.status)} = CASE WHEN ${col(N.attempts)} + 1 >= 6 THEN 'failed' ELSE 'pending' END::notifications.notification_status,
        ${col(N.claimedAt)} = NULL,
        ${col(N.lastError)} = CASE WHEN ${col(N.attempts)} + 1 >= 6 THEN 'reaped' ELSE ${col(N.lastError)} END
      WHERE ${col(N.status)} = 'sending' AND ${col(N.claimedAt)} < now() - ${stuck}
      RETURNING ${col(N.id)}`;
}

/** Same pending claim the dispatcher runs — hot-query tests EXPLAIN this. */
export function dispatchClaimSql(limit = CLAIM) {
  return sql`
          SELECT ${col(N.id)}, ${col(N.memberId)}, ${col(N.category)}, ${col(N.title)}, ${col(N.body)},
                 ${col(N.deepLink)}, ${col(N.offerId)}, ${col(N.attempts)}
          FROM ${N}
          WHERE ${col(N.status)} = 'pending' AND ${col(N.scheduledFor)} <= now()
          ORDER BY ${col(N.scheduledFor)}
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}`;
}

type TokenRow = typeof deviceTokens.$inferSelect;
type SendResult = Awaited<ReturnType<PushSender["send"]>>;

export type DispatchDeps = {
  db: Executor;
  push: PushSender;
  members: MembersFacade;
  publish: (
    tx: Executor,
    e: {
      type: string;
      version: number;
      aggregateType: string;
      aggregateId: string;
      memberId?: string | null;
      payload: unknown;
    },
  ) => Promise<unknown>;
  signal?: AbortSignal;
  /** SQL interval fragment. Default is five minutes. Tests pass a shorter literal. */
  stuckAfter?: SQL;
};

type Metrics = {
  claimed: number;
  sent: number;
  delivered: number;
  failed: number;
  suppressed: number;
  deactivated: number;
  reclaimed: number;
};

type WorkItem = {
  row: PendingRow;
  outcomes: { tok: TokenRow; result: SendResult }[];
};

/** Claim due rows, send outside the transaction, then record one outcome per notification. */
export async function dispatch(deps: DispatchDeps): Promise<Record<string, number>> {
  const metrics: Metrics = {
    claimed: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    suppressed: 0,
    deactivated: 0,
    reclaimed: 0,
  };
  const stuck = deps.stuckAfter ?? sql`interval '5 minutes'`;

  const reclaimed = await query(deps.db, dispatchReaperSql(stuck), ReclaimedRow);
  metrics.reclaimed = reclaimed.length;

  const work = await withTx(deps.db, async (tx) => {
    const rows = await query(tx, dispatchClaimSql(CLAIM), PendingRow);
    const out: { row: PendingRow; tokens: TokenRow[] }[] = [];
    for (const row of rows) {
      metrics.claimed++;
      const memberId = row.member_id;
      const notificationId = row.id;

      const status = await deps.members.getStatus(tx, memberId);
      if (status !== "active") {
        await tx
          .update(notificationsTable)
          .set({ status: "suppressed", lastError: `member_${status}` })
          .where(eq(notificationsTable.id, notificationId));
        metrics.suppressed++;
        continue;
      }

      if (row.category === "offers_personal" || row.category === "offers_broadcast") {
        const prefs = await deps.members.preferencesOf(tx, memberId);
        const allowed = row.category === "offers_personal" ? prefs.offers_personal : prefs.offers_broadcast;
        if (!allowed) {
          await tx
            .update(notificationsTable)
            .set({ status: "suppressed", lastError: "pref_disabled" })
            .where(eq(notificationsTable.id, notificationId));
          metrics.suppressed++;
          continue;
        }
      }

      const tokens = await tx
        .select()
        .from(deviceTokens)
        .where(and(eq(deviceTokens.memberId, memberId), eq(deviceTokens.active, true)));

      if (tokens.length === 0) {
        await tx
          .update(notificationsTable)
          .set({ status: "sent", sentAt: sql`now()`, attempts: sql`${notificationsTable.attempts} + 1` })
          .where(eq(notificationsTable.id, notificationId));
        metrics.sent++;
        continue;
      }

      await tx
        .update(notificationsTable)
        .set({ status: "sending", claimedAt: sql`now()` })
        .where(eq(notificationsTable.id, notificationId));
      out.push({ row, tokens });
    }
    return out;
  });

  if (deps.signal?.aborted) {
    const ids = work.map((item) => item.row.id);
    if (ids.length > 0) {
      await deps.db
        .update(notificationsTable)
        .set({ status: "pending", claimedAt: null })
        .where(inArray(notificationsTable.id, ids));
    }
    return metrics;
  }

  const results = await mapLimit(work, CONCURRENCY, async ({ row, tokens }) => ({
    row,
    outcomes: await Promise.all(
      tokens.map(async (tok) => {
        try {
          return {
            tok,
            result: await deps.push.send({
              platform: tok.platform,
              token: tok.nativeToken,
              title: row.title,
              body: row.body ?? undefined,
              data: {
                ...(row.deep_link ? { deepLink: row.deep_link } : {}),
                ...(row.offer_id ? { offerId: row.offer_id } : {}),
                notificationId: row.id,
              },
              collapseId: row.id,
            }),
          };
        } catch {
          return { tok, result: { ok: false as const, reason: "Transient" as const } };
        }
      }),
    ),
  }));

  for (const item of results) {
    await withTx(deps.db, (tx) => recordOutcome(tx, deps, item, metrics));
  }
  return metrics;
}

async function recordOutcome(tx: Executor, deps: DispatchDeps, item: WorkItem, metrics: Metrics): Promise<void> {
  const { row, outcomes } = item;
  let anyOk = false;
  let ticketId: string | null = null;
  let lastFail: string | null = null;
  let retryMs: number | null = null;
  const first = outcomes[0];
  let lastPlatform: "ios" | "android" = first ? first.tok.platform : "ios";

  for (const { tok, result } of outcomes) {
    lastPlatform = tok.platform;
    if (result.ok) {
      anyOk = true;
      ticketId = result.ticketId ?? ticketId;
      continue;
    }
    lastFail = result.reason;
    if (result.reason === "Unregistered" || result.reason === "BadDeviceToken") {
      await tx
        .update(deviceTokens)
        .set({ active: false, deactivatedReason: result.reason })
        .where(eq(deviceTokens.id, tok.id));
      metrics.deactivated++;
    } else if (result.reason === "Transient" || result.reason === "RateLimited") {
      retryMs = Math.max(retryMs ?? 0, result.retryAfterMs ?? 60_000);
    }
  }

  if (anyOk) {
    await tx
      .update(notificationsTable)
      .set({
        status: "delivered",
        ticketId,
        sentAt: sql`now()`,
        deliveredAt: sql`now()`,
        attempts: sql`${notificationsTable.attempts} + 1`,
        claimedAt: null,
      })
      .where(eq(notificationsTable.id, row.id));
    await deps.publish(tx, {
      type: "notification.delivered",
      version: 1,
      aggregateType: "notification",
      aggregateId: row.id,
      memberId: row.member_id,
      payload: event("notification.delivered", {
        notificationId: row.id,
        memberId: row.member_id,
        platform: lastPlatform,
        at: new Date().toISOString(),
      }),
    });
    metrics.delivered++;
    metrics.sent++;
    return;
  }

  if (retryMs !== null && row.attempts < 6) {
    await tx
      .update(notificationsTable)
      .set({
        status: "pending",
        claimedAt: null,
        attempts: sql`${notificationsTable.attempts} + 1`,
        scheduledFor: sql`now() + ${retryMs} * interval '1 millisecond'`,
        lastError: lastFail,
      })
      .where(eq(notificationsTable.id, row.id));
    return;
  }

  await tx
    .update(notificationsTable)
    .set({
      status: "failed",
      lastError: lastFail ?? "Fatal",
      attempts: sql`${notificationsTable.attempts} + 1`,
      claimedAt: null,
    })
    .where(eq(notificationsTable.id, row.id));
  await deps.publish(tx, {
    type: "notification.failed",
    version: 1,
    aggregateType: "notification",
    aggregateId: row.id,
    memberId: row.member_id,
    payload: event("notification.failed", {
      notificationId: row.id,
      memberId: row.member_id,
      platform: lastPlatform,
      reason: lastFail ?? "Fatal",
      at: new Date().toISOString(),
    }),
  });
  metrics.failed++;
}

/** Runs fn over items with at most `limit` in flight. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const i = next;
        next += 1;
        const item = items.at(i);
        if (item === undefined) return;
        out[i] = await fn(item);
      }
    }),
  );
  return out;
}
