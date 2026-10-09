import { withTx, type Executor } from "@bbc/db";
import { MAX_SEND_ATTEMPTS, type RequestsRepo } from "../infrastructure/requests.repo";
import { effectiveIntent } from "../application/intent";
import { signAction, type OperatorAction } from "../application/operator-links";

type Logger = { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };

/**
 * Every minute. The CRM call lives here, outside the submit transaction. A failed request is tried again five minutes
 * later, six times in all (MAX_SEND_ATTEMPTS); then nothing resends it — the member reads `not_sent` and is asked to
 * call, the giving up is logged, counted (`bbc_request_sends_given_up`) and posted to OPS_WEBHOOK, and an operator
 * re-queues it (infra/RUNBOOK.md, "A request that was never sent").
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
}) {
  const gaveUp = async (id: string | null, reference: string | null, reason: string) => {
    deps.metrics.inc("request_sends_given_up");
    deps.logger.error({ requestId: id, reference, err: reason }, "request send gave up");
    await deps.notifyOps(
      `request ${reference ?? id ?? "?"} was not sent after ${MAX_SEND_ATTEMPTS} attempts — re-queue it (RUNBOOK)`,
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
        const { crmRequestId } = await deps.crm.submitRequest({
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
          // What the member saw before asking for a quote (ADR-IMPL-042). Round trip: the formula's only trip.
          shown_estimate:
            row.shown_estimate_amount !== null && row.shown_estimate_currency !== null
              ? { amount: row.shown_estimate_amount, currency: row.shown_estimate_currency, cabin: row.cabin }
              : null,
          phone_valid: row.phone_valid,
          intent: effectiveIntent({
            intent: row.intent,
            fareId: row.fare_id,
            offerId: row.offer_id,
          }),
          replaces_fare_id: row.replaces_fare_id,
          _source: row.source,
          _app_version: row.app_version,
          _request_id: row.id,
          _actions: {
            quoted: actionUrl("quoted"),
            booked: actionUrl("booked"),
            closed: actionUrl("closed"),
          },
        });
        await withTx(deps.db, (tx) => deps.repo.markSent(tx, row.id, crmRequestId));
        sent++;
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        const attempts = await withTx(deps.db, (tx) => deps.repo.markFailed(tx, row.id, message));
        deps.logger.warn({ requestId: row.id, err: message }, "request send failed");
        if (attempts >= MAX_SEND_ATTEMPTS) await gaveUp(row.id, row.reference, message);
      }
    }
    return { sent, attempted: rows.length, rejected: rejected.length };
  };
}
