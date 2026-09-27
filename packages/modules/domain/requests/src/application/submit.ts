import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { withTx, type Executor } from "@bbc/db";
import { requests, requestEvents } from "@bbc/db/schema/requests";
import { event } from "@bbc/shared/events";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import { parseMemberPhone } from "@bbc/shared/phone";

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
  deps: {
    publish: Publish;
    rateLimit: {
      check: (
        rule: "requests.submit" | "requests.submit.ip",
        subject: string,
      ) => Promise<{ allowed: boolean; retryAfterMs?: number }>;
    };
  },
) {
  const body = RequestBody.parse(raw);
  const phone = parseMemberPhone(body.contact.phone);
  if (!phone.valid) return { ok: false as const, code: "VALIDATION" as const };

  // Idempotency first: a replay is not a new request and must not cost quota.
  const existing = await exec.select().from(requests).where(eq(requests.idempotencyKey, idempotencyKey)).limit(1);
  const replay = existing[0];
  if (replay) {
    if (replay.memberId !== actor.memberId) return { ok: false as const, code: "CONFLICT" as const };
    return { ok: true as const, request: replay, created: false as const };
  }

  if (actor.ip) {
    const ip = await deps.rateLimit.check("requests.submit.ip", `ip:${actor.ip}`);
    if (!ip.allowed) return { ok: false as const, code: "RATE_LIMITED" as const, retryAfterMs: ip.retryAfterMs };
  }
  if (actor.memberId) {
    const member = await deps.rateLimit.check("requests.submit", `m:${actor.memberId}`);
    if (!member.allowed)
      return { ok: false as const, code: "RATE_LIMITED" as const, retryAfterMs: member.retryAfterMs };
  }

  return withTx(exec, async (tx) => {
    const existing = await tx.select().from(requests).where(eq(requests.idempotencyKey, idempotencyKey)).limit(1);
    const replay = existing[0];
    if (replay) {
      if (replay.memberId !== actor.memberId) return { ok: false as const, code: "CONFLICT" as const };
      return { ok: true as const, request: replay, created: false as const };
    }

    const id = randomUUID();
    const reference = `R-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const firstLeg = body.legs[0];
    const lastLeg = body.legs[body.legs.length - 1];
    if (!firstLeg || !lastLeg) return { ok: false as const, code: "VALIDATION" as const };
    const route = `${firstLeg.from} → ${lastLeg.to}`;

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
        phoneE164: phone.e164,
        phoneValid: phone.valid,
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

    if (!row) throw new Error("request insert returned no row");
    return { ok: true as const, request: row, created: true as const };
  });
}
