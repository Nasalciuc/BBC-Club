import { and, eq, lte, sql } from "drizzle-orm";
import { withTx } from "@bbc/db";
import { event } from "@bbc/shared/events";
import { notificationsTable, deviceTokens } from "@bbc/db/schema/notifications";
import type { PushSender } from "../ports/push";
import type { MembersPort } from "../handlers/on-offer-published";

const BATCH = 100;
const MIN_GAP_MS = 50; // ≤20/s

export type DispatchDeps = {
  db: any;
  push: PushSender;
  members: MembersPort;
  publish: (
    tx: any,
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
};

/** Claim due pending rows (SKIP LOCKED), recheck consent/status, send via PushSender, record receipts. */
export async function dispatch(deps: DispatchDeps): Promise<Record<string, number>> {
  const metrics = { claimed: 0, sent: 0, delivered: 0, failed: 0, suppressed: 0, deactivated: 0 };

  // Process one-at-a-time inside short transactions so SKIP LOCKED works across replicas.
  for (let n = 0; n < BATCH; n++) {
    if (deps.signal?.aborted) break;

    const outcome = await withTx(deps.db, async (tx) => {
      const rows: any[] = await tx.execute(sql`
        SELECT id, member_id, category, title, body, deep_link, offer_id, attempts
        FROM notifications.notifications
        WHERE status = 'pending' AND scheduled_for <= now()
        ORDER BY scheduled_for
        FOR UPDATE SKIP LOCKED
        LIMIT 1`);
      const row = rows[0];
      if (!row) return "empty" as const;
      metrics.claimed++;

      const memberId = row.member_id as string;
      const notificationId = row.id as string;
      const category = row.category as string;

      // Recheck at send time (not enqueue time).
      const status = await deps.members.getStatus(tx, memberId);
      if (status !== "active") {
        await tx
          .update(notificationsTable)
          .set({ status: "suppressed", lastError: `member_${status}` })
          .where(eq(notificationsTable.id, notificationId));
        metrics.suppressed++;
        return "done" as const;
      }

      if (category === "offers_personal" || category === "offers_broadcast") {
        const prefs = await deps.members.preferencesOf(tx, memberId);
        const allowed = category === "offers_personal" ? prefs.offers_personal : prefs.offers_broadcast;
        if (!allowed) {
          await tx
            .update(notificationsTable)
            .set({ status: "suppressed", lastError: "pref_disabled" })
            .where(eq(notificationsTable.id, notificationId));
          metrics.suppressed++;
          return "done" as const;
        }
      }

      const tokens = await tx
        .select()
        .from(deviceTokens)
        .where(and(eq(deviceTokens.memberId, memberId), eq(deviceTokens.active, true)));

      if (tokens.length === 0) {
        // Inbox row stays; no device to push — mark sent without a provider ticket.
        await tx
          .update(notificationsTable)
          .set({ status: "sent", sentAt: sql`now()`, attempts: sql`${notificationsTable.attempts} + 1` })
          .where(eq(notificationsTable.id, notificationId));
        metrics.sent++;
        return "done" as const;
      }

      let anyOk = false;
      let lastFail: string | null = null;
      let lastPlatform: "ios" | "android" = tokens[0]!.platform;

      for (const tok of tokens) {
        const result = await deps.push.send({
          platform: tok.platform,
          token: tok.nativeToken,
          title: row.title,
          body: row.body ?? undefined,
          data: {
            ...(row.deep_link ? { deepLink: row.deep_link } : {}),
            ...(row.offer_id ? { offerId: row.offer_id } : {}),
            notificationId,
          },
        });
        lastPlatform = tok.platform;

        if (result.ok) {
          anyOk = true;
          await tx
            .update(notificationsTable)
            .set({
              status: "delivered",
              ticketId: result.ticketId ?? null,
              sentAt: sql`now()`,
              deliveredAt: sql`now()`,
              attempts: sql`${notificationsTable.attempts} + 1`,
            })
            .where(eq(notificationsTable.id, notificationId));
          await deps.publish(tx, {
            type: "notification.delivered",
            version: 1,
            aggregateType: "notification",
            aggregateId: notificationId,
            memberId,
            payload: event("notification.delivered", {
              notificationId,
              memberId,
              platform: tok.platform,
              at: new Date().toISOString(),
            }),
          });
          metrics.delivered++;
          metrics.sent++;
          break;
        }

        lastFail = result.reason;
        if (result.reason === "Unregistered" || result.reason === "BadDeviceToken") {
          await tx
            .update(deviceTokens)
            .set({ active: false, deactivatedReason: result.reason })
            .where(eq(deviceTokens.id, tok.id));
          metrics.deactivated++;
        } else if (result.reason === "Transient" || result.reason === "RateLimited") {
          const retryMs = result.retryAfterMs ?? 60_000;
          await tx
            .update(notificationsTable)
            .set({
              attempts: sql`${notificationsTable.attempts} + 1`,
              scheduledFor: sql`now() + ${retryMs} * interval '1 millisecond'`,
              lastError: result.reason,
            })
            .where(eq(notificationsTable.id, notificationId));
          return "done" as const;
        }
      }

      if (!anyOk) {
        await tx
          .update(notificationsTable)
          .set({
            status: "failed",
            lastError: lastFail ?? "Fatal",
            attempts: sql`${notificationsTable.attempts} + 1`,
          })
          .where(eq(notificationsTable.id, notificationId));
        await deps.publish(tx, {
          type: "notification.failed",
          version: 1,
          aggregateType: "notification",
          aggregateId: notificationId,
          memberId,
          payload: event("notification.failed", {
            notificationId,
            memberId,
            platform: lastPlatform,
            reason: lastFail ?? "Fatal",
            at: new Date().toISOString(),
          }),
        });
        metrics.failed++;
      }

      return "done" as const;
    });

    if (outcome === "empty") break;
    await Bun.sleep(MIN_GAP_MS);
  }

  return metrics;
}
