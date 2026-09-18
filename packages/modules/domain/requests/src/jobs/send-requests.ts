import type { Db } from "@bbc/db";
import type { RequestsRepo } from "../infrastructure/requests.repo";

type Logger = { warn: (obj: object, msg: string) => void };

type ClaimedRow = {
  id: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  legs: { from: string; to: string; date: string }[];
  trip_type: string;
  cabin: string;
  passengers: { adult: number; child: number; infant: number };
  source: string;
  app_version: string | null;
  send_attempts: number;
};

/** Every minute. CRM call lives here, outside submit tx. Six attempts; then stays not_sent for member retry. */
export function createSendRequestsJob(deps: {
  db: Db;
  repo: RequestsRepo;
  crm: { submitRequest(payload: unknown): Promise<{ crmRequestId: string }> };
  logger: Logger;
}) {
  return async function run() {
    let sent = 0;
    const rows = (await deps.db.transaction((tx) => deps.repo.claimUnsent(tx, 20))) as unknown as ClaimedRow[];

    for (const row of rows) {
      try {
        const { crmRequestId } = await deps.crm.submitRequest({
          client: { name: row.contact_name, phone: row.contact_phone, email: row.contact_email },
          flights: row.legs,
          trip_type: row.trip_type,
          cabin_class: row.cabin === "business" ? "Business Class" : "First Class",
          passengers: row.passengers,
          phone_valid: true,
          _source: row.source,
          _app_version: row.app_version,
        });
        await deps.db.transaction((tx) => deps.repo.markSent(tx, row.id, crmRequestId));
        sent++;
      } catch (err) {
        await deps.db.transaction((tx) => deps.repo.markFailed(tx, row.id, String(err)));
        deps.logger.warn({ requestId: row.id, err }, "request send failed");
      }
    }
    return { sent, attempted: rows.length };
  };
}
