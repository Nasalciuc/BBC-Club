import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { withTx, type Executor } from "@bbc/db";
import type { ResolvedRateRule } from "@bbc/shared/module-contract";
import { requests, requestEvents } from "@bbc/db/schema/requests";
import { event } from "@bbc/shared/events";
import { RequestBody, SubmittedRequestBody } from "@bbc/shared/api/v1/requests";
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
      /** The rule as it applies now — asked before the transaction opens (ADR-IMPL-071). */
      rule: (name: "requests.submit" | "requests.submit.ip") => Promise<ResolvedRateRule>;
      /** `exec`: the submit's transaction — the quota is counted on its connection, under its idempotency lock. */
      check: (
        rule: ResolvedRateRule,
        subject: string,
        exec: Executor,
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
  // A trip that can be flown (RequestBody): what the body says, the same whenever it is sent.
  const body = RequestBody.parse(raw);
  const phone = parseMemberPhone(body.contact.phone);
  if (!phone.valid) return { ok: false as const, code: "VALIDATION" as const };
  const route = requestRoute(body.legs, body.tripType);
  if (!route) return { ok: false as const, code: "VALIDATION" as const };

  // A replay already committed is answered at once: no lock, no quota, no catalog read — whatever the day. A phone that
  // never got its answer may send the request again after the trip's day has passed; the request it made stands.
  const committed = await byKey(exec, idempotencyKey);
  if (committed) return replayOf(committed, actor);
  // A new request: on a day not yet over everywhere (SubmittedRequestBody).
  SubmittedRequestBody.parse(raw);

  // The rules this request is counted by, as they stand now, read before the transaction opens: a rule's flag is read on
  // a pooled connection, and read inside the transaction, on a cold cache, each submit held one connection while it
  // waited for a second — with as many submits as connections, every one of them waited for ever (ADR-IMPL-071).
  const ipRule = actor.ip ? await deps.rateLimit.rule("requests.submit.ip") : null;
  const memberRule = actor.memberId ? await deps.rateLimit.rule("requests.submit") : null;

  try {
    return await withTx(exec, (tx) => write(tx));
  } catch (err) {
    // Refused by a limit: the transaction rolled back, so the 429 spent nothing — not the address's unit when the
    // member's own limit refused (the member's limit must not drain an address others share).
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
    if (actor.ip && ipRule) {
      const ip = await deps.rateLimit.check(ipRule, `ip:${actor.ip}`, tx);
      if (!ip.allowed)
        throw new RolledBack({ ok: false, code: "RATE_LIMITED", scope: "ip", retryAfterMs: ip.retryAfterMs });
    }
    if (actor.memberId && memberRule) {
      const member = await deps.rateLimit.check(memberRule, `m:${actor.memberId}`, tx);
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
    // A fare that no longer exists at all — a duplicate copy migration 0034 removed, under a request queued offline
    // before it — is left out: the request is taken for its trip, without the fare and without the price that was the
    // fare's, and the specialist quotes it. Refused, it was lost for good: the app never sends a refused request again.
    const fareGone = fare?.trip === "missing";
    const fareId = fareGone ? null : (body.fareId ?? null);
    const priceAtRequest = fareGone ? undefined : body.priceAtRequest;
    // The fare a request names must be this trip's — its outbound leg and cabin; one that has closed since is still
    // taken (an offline-queued request must not be lost). A read that failed checks nothing. A refusal from here on
    // keeps the quota it was counted (the transaction commits with nothing else written): a refused request costs what a
    // sent one does, so refusals cannot be looped for free.
    if (fare?.trip && fare.trip !== "missing" && outbound) {
      if (outbound.from !== fare.trip.from || outbound.to !== fare.trip.to) {
        return refused("legs.0", `This fare is for ${fare.trip.from} → ${fare.trip.to}.`);
      }
      if (body.cabin !== fare.trip.cabin) return refused("cabin", `This fare is for ${fare.trip.cabin} class.`);
    }
    // The offer a request names must be one the member could see; a withdrawn or expired one is still taken.
    if (body.offerId && deps.offer) {
      const offer = await deps.offer(body.offerId, actor.memberId);
      if (offer === "missing" || offer === "not_yours") return refused("offerId", "This offer is no longer available.");
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
        fareId,
        offerId: body.offerId ?? null,
        intent: body.intent ?? null,
        replacesFareId: body.replacesFareId ?? null,
        shownEstimateAmount: shown ? shown.amount : null,
        shownEstimateCurrency: shown ? shown.currency : null,
        // ADR-IMPL-063: who priced it, as the catalog said; none while the site's prices are off (the formula).
        shownEstimateSource: shown?.source ?? null,
        tripType: body.tripType,
        cabin: body.cabin,
        legs: body.legs,
        passengers: body.passengers,
        priceAtRequest: priceAtRequest != null ? String(priceAtRequest) : null,
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
        fareId,
        offerId: body.offerId ?? null,
        intent: body.intent ?? null,
        replacesFareId: body.replacesFareId ?? null,
        // The rules' fingerprint and the source ride along only in their own shape: the event's schema must never
        // refuse a request.
        shownEstimate: shown
          ? {
              amount: shown.amount,
              currency: shown.currency,
              ...(shown.rules && /^[0-9a-f]{16}$/.test(shown.rules) ? { rules: shown.rules } : {}),
              ...(shown.source === "site" || shown.source === "club" ? { source: shown.source } : {}),
            }
          : null,
        submittedAt: new Date().toISOString(),
      }),
    });

    // `fareLeftOut`: the fare it named, which no longer exists (counted and logged by the route).
    return {
      ok: true as const,
      request: row,
      created: true as const,
      fareLeftOut: fareGone ? (body.fareId ?? null) : null,
    };
  }
}

/** A limit's refusal, thrown inside the transaction so it rolls back — the quota counted in it with it. */
type RateRefusal = { ok: false; code: "RATE_LIMITED"; scope: "ip" | "member"; retryAfterMs?: number };

class RolledBack extends Error {
  constructor(public readonly result: RateRefusal) {
    super(result.code);
    this.name = "RolledBack";
  }
}

/** The fare or the offer a request names does not match it: answered with the field, the transaction committed. */
function refused(path: string, message: string) {
  return { ok: false as const, code: "VALIDATION" as const, message, details: [{ path, message }] };
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
