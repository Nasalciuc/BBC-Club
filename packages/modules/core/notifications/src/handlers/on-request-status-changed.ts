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
  // What happens next, true in every build: the specialist calls the member (11). The server cannot know whether the app
  // has the club's line to dial, so the push never asks the member to call (brief 3.5).
  const body = `${evt.route ?? "Your trip"} — a specialist will call you shortly`;
  const deepLink = `bbcclub://requests/${evt.requestId}`;
  const n = notificationsTable;
  // The partial unique index notif_member_request_cat: ON CONFLICT names its columns and its WHERE.
  await deps.tx
    .insert(n)
    .values({
      memberId: evt.memberId,
      category: "transactional",
      title: "Your quote is ready",
      body,
      deepLink,
      requestId: evt.requestId,
      sourceEventId: deps.sourceEventId,
      status: "pending",
      scheduledFor: sql`now()`,
    })
    .onConflictDoNothing({ target: [n.memberId, n.requestId, n.category], where: sql`${n.requestId} IS NOT NULL` });
}
