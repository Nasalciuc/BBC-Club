import { sql } from "drizzle-orm";
import { OfferPublishedV1 } from "@bbc/shared/events/offer";
import { campaigns } from "@bbc/db/schema/notifications";
import type { MembersFacade } from "@bbc/members";
import { afterQuietHoursIn, DEFAULT_TIME_ZONE, zonesForPostgres } from "../application/quiet-hours";
import { cappedOnSendDay } from "../application/daily-cap";
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
    /** The clock (tests pin it). */
    now?: () => Date;
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

  // A stored zone Postgres cannot read never fails the delivery: the club's default, and the member named in the log
  // with why.
  const stored = await deps.members.timezoneOf(deps.tx, memberId);
  const read = (await zonesForPostgres(deps.tx, [stored])).get(stored);
  if (!read || read.fallback)
    deps.logger?.warn(
      { memberId, reason: read?.fallback ?? "invalid_time_zone" },
      "member time zone not read; default used",
    );
  const tz = read?.zone ?? DEFAULT_TIME_ZONE;
  // Not before the offer is published: a push for one published later would open a 404 until then.
  const now = deps.now?.() ?? new Date();
  const from = new Date(Math.max(now.getTime(), new Date(evt.publishedAt).getTime()));
  const sendAt = await afterQuietHoursIn(deps.tx, from, tz);

  // Cap: at most one offer push per member per day — the day this one is sent, in the member's zone, whenever the
  // other was created (daily-cap.ts). Enqueue-time check; the campaign job applies the same.
  const capped = await cappedOnSendDay(deps.tx, [{ memberId, timeZone: tz, sendAt }]);
  if (capped.has(memberId)) return;
  const scheduledFor = sendAt.toISOString();

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
