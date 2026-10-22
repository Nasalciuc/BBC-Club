import { sql } from "drizzle-orm";
import { OfferPublishedV1 } from "@bbc/shared/events/offer";
import { campaigns } from "@bbc/db/schema/notifications";
import type { MembersFacade } from "@bbc/members";
import { safeTimeZone, scheduleAfterQuietHours } from "../application/quiet-hours";
import type { Executor } from "@bbc/db";

/** `offer.published` → a personal offer becomes one pending inbox/push row; a broadcast becomes one campaign row,
 *  fanned out later by the `campaign-fanout` job (never inside this delivery transaction).
 *  Idempotent: UNIQUE (member_id, offer_id, category) for the row, UNIQUE source_event_id for the campaign. */
export async function onOfferPublished(
  deps: {
    tx: Executor;
    members: MembersFacade;
    sourceEventId: string;
    /** Says which member's stored time zone was not one (their row follows the club's default). */
    logger?: { warn(obj: object, msg: string): void };
  },
  raw: unknown,
): Promise<void> {
  const evt = OfferPublishedV1.parse(raw);
  const body = `${evt.routeFrom} → ${evt.routeTo}`;
  const deepLink = `bbcclub://proposal/${evt.offerId}`;

  if (evt.targeting === "broadcast") {
    // Record only — the audience is paged by the job, one transaction per 1 000 members.
    await deps.tx
      .insert(campaigns)
      .values({
        offerId: evt.offerId,
        sourceEventId: deps.sourceEventId,
        category: "offers_broadcast",
        title: evt.title,
        body,
        deepLink,
        // An offer published for later is pushed then, never while it is still invisible (campaign-fanout waits).
        notBefore: new Date(evt.publishedAt),
      })
      .onConflictDoNothing({ target: campaigns.sourceEventId });
    return;
  }
  // segment: targets live in proposals.offer_targets — core cannot JOIN across schemas.
  if (evt.targeting !== "user" || !evt.targetMemberId) return;

  const memberId = evt.targetMemberId;
  const status = await deps.members.getStatus(deps.tx, memberId);
  if (status !== "active") return;
  const prefs = await deps.members.preferencesOf(deps.tx, memberId);
  if (!prefs.offers_personal) return;

  // Cap: at most one offer push per member per server day — date_trunc('day', now()) in the database session's
  // time zone (UTC on the host), not the member's local day. Enqueue-time check; the campaign job applies the same.
  const alreadyToday: any[] = await deps.tx.execute(sql`
    SELECT 1 FROM notifications.notifications
    WHERE member_id = ${memberId}
      AND category IN ('offers_personal', 'offers_broadcast')
      AND created_at >= date_trunc('day', now())
    LIMIT 1`);
  if (alreadyToday.length > 0) return;

  // A stored zone that is not one never fails the delivery: the club's default, and the member named in the log.
  const tz = safeTimeZone(await deps.members.timezoneOf(deps.tx, memberId), () =>
    deps.logger?.warn({ memberId, reason: "invalid_time_zone" }, "member time zone not valid; default used"),
  );
  // Not before the offer is published: a push for one published later would open a 404 until then.
  const from = new Date(Math.max(Date.now(), new Date(evt.publishedAt).getTime()));
  const scheduledFor = scheduleAfterQuietHours(from, tz).toISOString();

  // Partial unique index: ON CONFLICT must name the same columns + WHERE offer_id IS NOT NULL.
  await deps.tx.execute(sql`
    INSERT INTO notifications.notifications
      (member_id, category, title, body, deep_link, offer_id, source_event_id, status, scheduled_for)
    VALUES
      (${memberId}, 'offers_personal', ${evt.title}, ${body}, ${deepLink}, ${evt.offerId}::uuid,
       ${deps.sourceEventId}, 'pending', ${scheduledFor}::timestamptz)
    ON CONFLICT (member_id, offer_id, category) WHERE offer_id IS NOT NULL
    DO NOTHING`);
}
