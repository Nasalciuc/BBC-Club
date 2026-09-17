import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { withTx, type Executor } from "@bbc/db";
import { requests, requestEvents } from "@bbc/db/schema/requests";
import { event } from "@bbc/shared/events";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import { bumpCounter } from "@bbc/db/helpers";
import { rateLimits } from "@bbc/platform/schema";

type Publish = (
  tx: Executor,
  e: {
    type: string;
    version: number;
    aggregateType: string;
    aggregateId: string;
    memberId: string | null;
    payload: unknown;
  },
) => Promise<void>;

export type SubmitActor = {
  memberId: string | null;
  source: "ios" | "android";
  appVersion: string | null;
  ip: string | null;
};

/** One transaction: the row, its first event, and the journal entry. CRM is out of band (send-requests job). */
export async function submit(
  exec: Executor,
  raw: unknown,
  actor: SubmitActor,
  idempotencyKey: string,
  deps: { publish: Publish },
) {
  const body = RequestBody.parse(raw);

  // Rate limits before the write — 5/h per member, 3/h per IP (reCAPTCHA deferred).
  const windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);
  const expiresAt = new Date(windowStart.getTime() + 3_600_000);

  if (actor.memberId) {
    const n = await bumpCounter(
      exec,
      rateLimits,
      { key: `requests:member:${actor.memberId}`, windowStart, expiresAt },
      rateLimits.count,
      [rateLimits.key],
      5,
    );
    if (n == null) return { ok: false as const, code: "RATE_LIMITED" as const };
  }
  if (actor.ip) {
    const n = await bumpCounter(
      exec,
      rateLimits,
      { key: `requests:ip:${actor.ip}`, windowStart, expiresAt },
      rateLimits.count,
      [rateLimits.key],
      3,
    );
    if (n == null) return { ok: false as const, code: "RATE_LIMITED" as const };
  }

  return withTx(exec, async (tx) => {
    const existing = await tx.select().from(requests).where(eq(requests.idempotencyKey, idempotencyKey)).limit(1);
    if (existing.length > 0) return { ok: true as const, request: existing[0]!, created: false as const };

    const id = randomUUID();
    const reference = `R-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
    const route = `${body.legs[0]!.from} → ${body.legs[body.legs.length - 1]!.to}`;

    const [row] = await tx
      .insert(requests)
      .values({
        id,
        reference,
        memberId: actor.memberId,
        idempotencyKey,
        fareId: body.fareId ?? null,
        offerId: body.offerId ?? null,
        tripType: body.tripType,
        cabin: body.cabin,
        legs: body.legs,
        passengers: body.passengers,
        priceAtRequest: body.priceAtRequest != null ? String(body.priceAtRequest) : null,
        contactName: body.contact.name,
        contactPhone: body.contact.phone,
        contactEmail: body.contact.email,
        note: body.note ?? null,
        source: actor.source,
        appVersion: actor.appVersion,
      })
      .returning();

    await tx.insert(requestEvents).values({ requestId: id, status: "received", actor: "system" });

    await deps.publish(tx, {
      type: "request.submitted",
      version: 1,
      aggregateType: "request",
      aggregateId: id,
      memberId: actor.memberId,
      payload: event("request.submitted", {
        requestId: id,
        memberId: actor.memberId,
        reference,
        route,
        cabin: body.cabin,
        fareId: body.fareId ?? null,
        offerId: body.offerId ?? null,
        submittedAt: new Date().toISOString(),
      }),
    });

    return { ok: true as const, request: row!, created: true as const };
  });
}
