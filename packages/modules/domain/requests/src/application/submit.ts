import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { withTx, type Executor } from "@bbc/db";
import { requests, requestEvents } from "@bbc/db/schema/requests";
import { event } from "@bbc/shared/events";
import { SubmittedRequestBody } from "@bbc/shared/api/v1/requests";
import type { ShownEstimate } from "./estimate";
import type { FareAtRequest } from "./published";
import type { OfferCheck } from "./offer";
import { parseMemberPhone } from "@bbc/shared/phone";
import { effectiveIntent } from "./intent";
import { requestRoute } from "./route";

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
      /** `exec`: the submit's transaction — the quota is counted on its connection, under its idempotency lock. */
      check: (
        rule: "requests.submit" | "requests.submit.ip",
        subject: string,
        exec?: Executor,
      ) => Promise<{ allowed: boolean; retryAfterMs?: number }>;
    };
    /** The indicative price the search shows for a route (catalog, ADR-IMPL-042). Never throws: null when unknown. */
    indicative: (q: { from: string; to: string; cabin: "business" | "first" }) => Promise<ShownEstimate | null>;
    /** What a fare request records of its fare, read once from the catalog: the published price, for the price the app
     *  sent (ADR-IMPL-046), and the airline (ADR-IMPL-056). Never throws: nulls when there is nothing to record.
     *  Absent, a request records neither. */
    fare?: (fareId: string, priceAtRequest: number | undefined) => Promise<FareAtRequest>;
    /** Whether the member could have seen the offer a request names (proposals). Null when it could not be read. Absent,
     *  the offer is not checked. */
    offer?: (offerId: string, memberId: string | null) => Promise<OfferCheck>;
  },
) {
  // A trip that can be flown, on a day not yet over everywhere (SubmittedRequestBody).
  const body = SubmittedRequestBody.parse(raw);
  const phone = parseMemberPhone(body.contact.phone);
  if (!phone.valid) return { ok: false as const, code: "VALIDATION" as const };
  const route = requestRoute(body.legs, body.tripType);
  if (!route) return { ok: false as const, code: "VALIDATION" as const };

  // A replay already committed is answered at once: no lock, no quota, no catalog read.
  const committed = await byKey(exec, idempotencyKey);
  if (committed) return replayOf(committed, actor);

  try {
    return await withTx(exec, (tx) => write(tx));
  } catch (err) {
    // Refused after the quota was counted: the transaction rolled back, so the refusal spent nothing — neither the
    // address's unit when the member's own limit refused, nor either when the request did not pass.
    if (err instanceof RolledBack) return err.result;
    throw err;
  }

  async function write(tx: Executor) {
    // Idempotency first, under a lock on the key: a replay is not a new request and must not cost quota. Calls racing
    // with one key (a double tap, a retry racing the first) wait here; the first spends one unit and inserts, and the
    // others then find its row — before any rate check or catalog read. Held until this transaction ends.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`req:${idempotencyKey}`}, 0))`);
    const replay = await byKey(tx, idempotencyKey);
    if (replay) return replayOf(replay, actor);

    // Counted on this transaction's connection, so nothing here waits for a second one while holding the lock; a unit
    // is spent only if the request is written. `scope` says which limit refused: the address's (an office, a hotel,
    // a carrier's NAT — shared with others) or the member's own; the app words them differently.
    if (actor.ip) {
      const ip = await deps.rateLimit.check("requests.submit.ip", `ip:${actor.ip}`, tx);
      if (!ip.allowed)
        throw new RolledBack({ ok: false, code: "RATE_LIMITED", scope: "ip", retryAfterMs: ip.retryAfterMs });
    }
    if (actor.memberId) {
      const member = await deps.rateLimit.check("requests.submit", `m:${actor.memberId}`, tx);
      if (!member.allowed) {
        throw new RolledBack({ ok: false, code: "RATE_LIMITED", scope: "member", retryAfterMs: member.retryAfterMs });
      }
    }

    // A quote (no fare, no offer) whose app showed the indicative fare carries that estimate for its outbound route —
    // recomputed here, never taken from the app: the app says only that it showed one (`estimateShown`), and a price
    // sent with the body is not in RequestBody and is dropped by the parse (ADR-IMPL-042). Asked after the idempotency
    // and rate checks — a replay or a refused request never asks: two cached flag rows and, with estimates on and valid
    // rules, two indexed reads, each bounded by its own timeout (askWithin), so a busy pool delays a request by at most
    // that and records no estimate.
    const outbound = body.legs[0];
    const quote =
      effectiveIntent({ intent: body.intent ?? null, fareId: body.fareId ?? null, offerId: body.offerId ?? null }) ===
      "quote";
    const shown =
      quote && body.estimateShown === true && outbound
        ? await deps.indicative({ from: outbound.from, to: outbound.to, cabin: body.cabin })
        : null;
    // A request made from a fare keeps, as they stood when the member asked, the fare's published price and its source
    // — the detail strikes it beside the fare once the quote is ready (ADR-IMPL-046) — and its airline, which the
    // request received and its detail name (ADR-IMPL-056). One read from the catalog — the body has no such fields; the
    // published price only for the price the app sent: a fare re-priced since then records none, its airline still.
    const fare = body.fareId && deps.fare ? await deps.fare(body.fareId, body.priceAtRequest) : null;
    const published = fare?.published ?? null;
    const carrier = fare?.carrier ?? null;
    // The fare a request names must exist and be this trip's — its outbound leg and cabin; one that has closed since is
    // still taken (an offline-queued request must not be lost). A read that failed checks nothing.
    if (fare?.trip === "missing") refuse("fareId", "This fare is no longer available.");
    if (fare?.trip && outbound) {
      if (outbound.from !== fare.trip.from || outbound.to !== fare.trip.to) {
        refuse("legs.0", `This fare is for ${fare.trip.from} → ${fare.trip.to}.`);
      }
      if (body.cabin !== fare.trip.cabin) refuse("cabin", `This fare is for ${fare.trip.cabin} class.`);
    }
    // The offer a request names must be one the member could see; a withdrawn or expired one is still taken.
    if (body.offerId && deps.offer) {
      const offer = await deps.offer(body.offerId, actor.memberId);
      if (offer === "missing" || offer === "not_yours") refuse("offerId", "This offer is no longer available.");
    }

    const id = randomUUID();
    const reference = `R-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

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
        publishedAtRequest: published ? published.amount.toFixed(2) : null,
        publishedSourceAtRequest: published ? published.source : null,
        carrierAtRequest: carrier ? carrier.code : null,
        carrierNameAtRequest: carrier ? carrier.name : null,
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
      // Not reached while the key's lock holds; kept as the backstop: ON CONFLICT waited for the other call, and this
      // statement sees its row. Replay it, as a later retry would.
      const first = await byKey(tx, idempotencyKey);
      if (!first) throw new Error("request insert returned no row");
      return replayOf(first, actor);
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
        // The rules' fingerprint rides along only in its own shape: the event's schema must never refuse a request.
        shownEstimate: shown
          ? {
              amount: shown.amount,
              currency: shown.currency,
              ...(shown.rules && /^[0-9a-f]{16}$/.test(shown.rules) ? { rules: shown.rules } : {}),
            }
          : null,
        submittedAt: new Date().toISOString(),
      }),
    });

    return { ok: true as const, request: row, created: true as const };
  }
}

type Refusal =
  | { ok: false; code: "VALIDATION"; message: string; details: { path: string; message: string }[] }
  | { ok: false; code: "RATE_LIMITED"; scope: "ip" | "member"; retryAfterMs?: number };

/** Thrown inside the transaction so it rolls back — the quota counted in it with it — and answered with `result`. */
class RolledBack extends Error {
  constructor(public readonly result: Refusal) {
    super(result.code);
    this.name = "RolledBack";
  }
}

function refuse(path: string, message: string): never {
  throw new RolledBack({ ok: false, code: "VALIDATION", message, details: [{ path, message }] });
}

type RequestRow = typeof requests.$inferSelect;

async function byKey(exec: Executor, idempotencyKey: string): Promise<RequestRow | undefined> {
  const [row] = await exec.select().from(requests).where(eq(requests.idempotencyKey, idempotencyKey)).limit(1);
  return row;
}

/** A key seen before: the same member gets the first request back; another member's reuse of it is a conflict. */
function replayOf(row: RequestRow, actor: SubmitActor) {
  if (row.memberId !== actor.memberId) return { ok: false as const, code: "CONFLICT" as const };
  return { ok: true as const, request: row, created: false as const };
}
