import { errorLine, withTx, type Executor } from "@bbc/db";
import { MAX_SEND_ATTEMPTS, type RequestsRepo } from "../infrastructure/requests.repo";
import { effectiveIntent } from "../application/intent";
import { signAction, type OperatorAction } from "../application/operator-links";
import type { CrmFailure, CrmRequestPayload } from "@bbc/crm";

/** The offer an offer request names, as the specialist reads it when the request is sent. */
export type OfferForCrm = { id: string; title: string; price: { amount: number; currency: string } };

/** A price as the request stored it (text, numeric): a positive amount, or none. */
function amountOf(raw: string | number | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Logger = { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };

/** A CRM failure that sending again cannot fix: the CRM refused the request as it is (`retryable` false, ADR-IMPL-065 —
 *  a 4xx other than 408 and 429). Anything else — a timeout, a network error, a 408, 429 or 5xx, an error that does not
 *  say — is tried again. */
function refusedForGood(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as Partial<CrmFailure>).retryable === false;
}

/**
 * Every minute. The CRM call lives here, outside the submit transaction. A failed request is tried again five minutes
 * later, six times in all (MAX_SEND_ATTEMPTS); one the CRM refused as it is (ADR-IMPL-065) is given up at once. Then
 * nothing resends it — the member reads `not_sent`, the giving up is logged, counted (`bbc_request_sends_given_up`) and
 * posted to OPS_WEBHOOK, and an operator re-queues it (infra/RUNBOOK.md, "A request that was never sent").
 */
export function createSendRequestsJob(deps: {
  db: Executor;
  repo: RequestsRepo;
  crm: { submitRequest(payload: unknown): Promise<{ crmRequestId: string }> };
  logger: Logger;
  metrics: { inc(name: string, labels?: Record<string, string>): void };
  /** Posts one line to the ops channel; never throws (a failed post is logged by the caller's wrapper). */
  notifyOps: (text: string) => Promise<void>;
  appOrigin: string;
  opsLinkSecret: string;
  /** The offer an offer request names (proposals, system scope), read when the request is sent. Never throws: null when
   *  it cannot be read — the request is sent without it. Absent, no offer is read. */
  offer?: (offerId: string) => Promise<OfferForCrm | null>;
}) {
  const gaveUp = async (id: string | null, reference: string | null, reason: string, refused = false) => {
    deps.metrics.inc("request_sends_given_up");
    deps.logger.error({ requestId: id, reference, err: reason, refused }, "request send gave up");
    await deps.notifyOps(
      refused
        ? `request ${reference ?? id ?? "?"} was refused by the CRM (the log says why) — fix the cause, then re-queue it (RUNBOOK)`
        : `request ${reference ?? id ?? "?"} was not sent after ${MAX_SEND_ATTEMPTS} attempts — re-queue it (RUNBOOK)`,
    );
  };

  return async function run() {
    let sent = 0;
    const { rows, rejected } = await withTx(deps.db, (tx) => deps.repo.claimUnsent(tx, 20));
    for (const bad of rejected) {
      deps.logger.warn({ requestId: bad.id, err: bad.reason }, "request send failed");
      if (bad.attempts >= MAX_SEND_ATTEMPTS) await gaveUp(bad.id, null, bad.reason);
    }

    for (const row of rows) {
      try {
        const origin = deps.appOrigin.replace(/\/+$/, "");
        const actionUrl = (action: OperatorAction) =>
          `${origin}/ops/requests/${signAction(deps.opsLinkSecret, row.id, action)}`;
        const price = amountOf(row.price_at_request);
        const published = amountOf(row.published_at_request);
        const offer = row.offer_id && deps.offer ? await deps.offer(row.offer_id) : null;
        const payload: CrmRequestPayload = {
          reference: row.reference,
          client: {
            name: row.contact_name,
            phone: row.phone_e164 ?? row.contact_phone,
            email: row.contact_email,
          },
          flights: row.legs,
          trip_type: row.trip_type,
          cabin_class: row.cabin === "business" ? "Business Class" : "First Class",
          passengers: row.passengers,
          note: row.note,
          // What the member saw before asking for a quote (ADR-IMPL-042). Round trip: the formula's only trip. Who
          // priced it when the request recorded it (ADR-IMPL-063): the company's site or the club's formula.
          shown_estimate:
            row.shown_estimate_amount !== null && row.shown_estimate_currency !== null
              ? {
                  amount: row.shown_estimate_amount,
                  currency: row.shown_estimate_currency,
                  cabin: row.cabin,
                  ...(row.shown_estimate_source ? { source: row.shown_estimate_source } : {}),
                }
              : null,
          phone_valid: row.phone_valid,
          intent: effectiveIntent({
            intent: row.intent,
            fareId: row.fare_id,
            offerId: row.offer_id,
          }),
          replaces_fare_id: row.replaces_fare_id,
          // Which fare or offer, and what the member saw (ADR-IMPL-046, ADR-IMPL-056): the specialist calls about it.
          fare_id: row.fare_id,
          offer_id: row.offer_id,
          price_at_request: price !== null ? { amount: price, currency: "USD" } : null,
          published_at_request:
            published !== null && row.published_source_at_request
              ? { amount: published, source: row.published_source_at_request }
              : null,
          carrier: row.carrier_name_at_request
            ? { code: row.carrier_at_request, name: row.carrier_name_at_request }
            : null,
          offer,
          // Which try: past the first, the mail may be a copy of one a timed-out send delivered after all.
          _attempt: row.send_attempts + 1,
          _source: row.source,
          _app_version: row.app_version,
          _request_id: row.id,
          _actions: {
            quoted: actionUrl("quoted"),
            booked: actionUrl("booked"),
            closed: actionUrl("closed"),
          },
        };
        const { crmRequestId } = await deps.crm.submitRequest(payload);
        await withTx(deps.db, (tx) => deps.repo.markSent(tx, row.id, crmRequestId));
        sent++;
      } catch (err) {
        // One line without a failed query's parameters: it is stored on the request and logged (AGENTS.md rule 6).
        const message = errorLine(err).slice(0, 500);
        const refused = refusedForGood(err);
        const attempts = await withTx(deps.db, (tx) =>
          refused ? deps.repo.markGivenUp(tx, row.id, message) : deps.repo.markFailed(tx, row.id, message),
        );
        deps.logger.warn({ requestId: row.id, err: message, refused }, "request send failed");
        if (attempts >= MAX_SEND_ATTEMPTS) await gaveUp(row.id, row.reference, message, refused);
      }
    }
    return { sent, attempted: rows.length, rejected: rejected.length };
  };
}
