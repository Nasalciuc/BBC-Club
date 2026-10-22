import { and, eq, sql } from "drizzle-orm";
import { RequestStatusChangedV1 } from "@bbc/shared/events/request";
import { notificationsTable } from "@bbc/db/schema/notifications";
import type { Executor } from "@bbc/db";

/** `request.status_changed` → "Your quote is ready" (transactional) when a request reaches `quoted`. One row per
 *  member and request (notif_member_request_cat): a re-delivered event writes nothing.
 *  A request closed or booked before the push went out takes it back: its pending row is suppressed
 *  (`request_moved_on`), as a withdrawn offer's is — core cannot ask requests (domain) at dispatch, so the event
 *  carries the state (AGENTS.md rule 3). A row already `sending` is left to finish. */
export async function onRequestStatusChanged(
  deps: { tx: Executor; sourceEventId: string },
  raw: unknown,
): Promise<void> {
  const evt = RequestStatusChangedV1.parse(raw);
  if (evt.to === "closed" || evt.to === "booked") {
    await deps.tx
      .update(notificationsTable)
      .set({ status: "suppressed", lastError: "request_moved_on" })
      .where(
        and(
          eq(notificationsTable.requestId, evt.requestId),
          eq(notificationsTable.category, "transactional"),
          eq(notificationsTable.status, "pending"),
        ),
      );
    return;
  }
  if (evt.to !== "quoted" || !evt.memberId) return;
  const body = `${evt.route ?? "Your trip"} — tap to call your specialist`;
  const deepLink = `bbcclub://requests/${evt.requestId}`;
  await deps.tx.execute(sql`
    INSERT INTO notifications.notifications
      (member_id, category, title, body, deep_link, request_id, source_event_id, status, scheduled_for)
    VALUES
      (${evt.memberId}, 'transactional', 'Your quote is ready', ${body}, ${deepLink},
       ${evt.requestId}::uuid, ${deps.sourceEventId}, 'pending', now())
    ON CONFLICT (member_id, request_id, category) WHERE request_id IS NOT NULL
    DO NOTHING`);
}
