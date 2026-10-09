import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { withTx, type Executor } from "@bbc/db";
import { requests, requestEvents } from "@bbc/db/schema/requests";
import { event } from "@bbc/shared/events";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import type { EstimateVM } from "@bbc/shared/api/v1/fares";
import { parseMemberPhone } from "@bbc/shared/phone";
import { effectiveIntent } from "./intent";

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
    /** The indicative price the search shows for a route (catalog, ADR-IMPL-042). Never throws: null when unknown. */
    indicative: (q: { from: string; to: string; cabin: "business" | "first" }) => Promise<EstimateVM | null>;
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

  // A quote (no fare, no offer) carries the estimate the search showed for its outbound route — recomputed here, never
  // taken from the app: a price sent with the body is not in RequestBody and is dropped by the parse (ADR-IMPL-042).
  // Read before the transaction: it is a cached flag and, with estimates on, two indexed reads.
  const outbound = body.legs[0];
  const quote =
    effectiveIntent({ intent: body.intent ?? null, fareId: body.fareId ?? null, offerId: body.offerId ?? null }) ===
    "quote";
  const shown =
    quote && outbound ? await deps.indicative({ from: outbound.from, to: outbound.to, cabin: body.cabin }) : null;

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
        intent: body.intent ?? null,
        replacesFareId: body.replacesFareId ?? null,
        shownEstimateAmount: shown ? shown.amount : null,
        shownEstimateCurrency: shown ? shown.currency : null,
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
      .onConflictDoNothing({ target: requests.idempotencyKey })
      .returning();
    if (!row) {
      // The same key arrived twice at once (a double tap, a retry racing the first) and the other call committed
      // first: ON CONFLICT waited for it, and this statement sees its row. Replay it, as a later retry would.
      const [first] = await tx.select().from(requests).where(eq(requests.idempotencyKey, idempotencyKey)).limit(1);
      if (!first) throw new Error("request insert returned no row");
      if (first.memberId !== actor.memberId) return { ok: false as const, code: "CONFLICT" as const };
      return { ok: true as const, request: first, created: false as const };
    }

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
        intent: body.intent ?? null,
        replacesFareId: body.replacesFareId ?? null,
        shownEstimate: shown ? { amount: shown.amount, currency: shown.currency } : null,
        submittedAt: new Date().toISOString(),
      }),
    });

    return { ok: true as const, request: row, created: true as const };
  });
}
