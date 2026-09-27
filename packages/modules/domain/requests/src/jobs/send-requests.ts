import { z } from "zod";
import { withTx, type Executor } from "@bbc/db";
import type { RequestsRepo } from "../infrastructure/requests.repo";
import { signAction, type OperatorAction } from "../application/operator-links";

type Logger = { warn: (obj: object, msg: string) => void };

const ClaimedRow = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  contact_name: z.string(),
  contact_phone: z.string().min(7),
  contact_email: z.string(),
  legs: z.array(z.object({ from: z.string(), to: z.string(), date: z.string() })),
  trip_type: z.string(),
  cabin: z.string(),
  passengers: z.object({
    adult: z.coerce.number(),
    child: z.coerce.number(),
    infant: z.coerce.number(),
  }),
  source: z.string(),
  app_version: z.string().nullable(),
  send_attempts: z.coerce.number().int(),
  phone_valid: z.coerce.boolean(),
  phone_e164: z.string().nullable(),
});

function claimedRows(raw: unknown) {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && "rows" in raw
      ? (raw as { rows: unknown }).rows
      : [];
  return z.array(ClaimedRow).parse(list);
}

/** Every minute. CRM call lives here, outside submit tx. Six attempts; then stays not_sent for member retry. */
export function createSendRequestsJob(deps: {
  db: Executor;
  repo: RequestsRepo;
  crm: { submitRequest(payload: unknown): Promise<{ crmRequestId: string }> };
  logger: Logger;
  appOrigin: string;
  opsLinkSecret: string;
}) {
  return async function run() {
    let sent = 0;
    const rows = claimedRows(await withTx(deps.db, (tx) => deps.repo.claimUnsent(tx, 20)));

    for (const row of rows) {
      try {
        const actionUrl = (action: OperatorAction) =>
          `${deps.appOrigin}/ops/requests/${signAction(deps.opsLinkSecret, row.id, action)}`;
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
          phone_valid: row.phone_valid,
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
        await withTx(deps.db, (tx) => deps.repo.markFailed(tx, row.id, message));
        deps.logger.warn({ requestId: row.id, err: message }, "request send failed");
      }
    }
    return { sent, attempted: rows.length };
  };
}
