import { RequestVM as RequestVMSchema, type RequestVM } from "@bbc/shared/api/v1/requests";
import { requestDates, requestRoute } from "@bbc/shared/requests/display";
import type { requests, requestEvents } from "@bbc/db/schema/requests";
import { MAX_SEND_ATTEMPTS } from "../infrastructure/requests.repo";

type RequestRow = typeof requests.$inferSelect;
type EventRow = typeof requestEvents.$inferSelect;

/** Longer than the job's six attempts five minutes apart (~30 min): a request still not passed on by then is not on its
 *  way, whatever the attempts say — the worker may be down. */
export const UNSENT_TOO_LONG_MS = 45 * 60_000;

/**
 * The state a member reads. A state the CRM or an operator set wins — even if our own send has not been recorded (the
 * e-mail went out, the bookkeeping failed). A request we hold but have not passed on yet is received (Figma 233:4639:
 * "Your request is with us."): the job passes it on at its next run. It is `not_sent` once the job has given up, or
 * once it has waited too long for any reason.
 */
export function memberStatus(
  row: Pick<RequestRow, "sentToCrm" | "status" | "sendAttempts" | "createdAt">,
  now: number,
): RequestVM["status"] {
  if (row.sentToCrm || row.status !== "received") return row.status;
  const gaveUp = row.sendAttempts >= MAX_SEND_ATTEMPTS || now - row.createdAt.getTime() > UNSENT_TOO_LONG_MS;
  return gaveUp ? "not_sent" : "received";
}

/** Map a DB row (+ optional timeline, + the destination's city) to the shared RequestVM. Reference is blank until CRM
 *  echoes. */
export function toRequestVM(
  row: RequestRow,
  timeline: EventRow[] = [],
  city: string | null = null,
  now: number = Date.now(),
): RequestVM {
  const status = RequestVMSchema.shape.status.parse(memberStatus(row, now));

  return {
    id: row.id,
    reference: row.sentToCrm ? row.reference : "",
    route: requestRoute(row.legs, row.tripType),
    city,
    tripType: row.tripType,
    phone: row.phoneE164 ?? (row.contactPhone || null),
    dates: requestDates(row.legs),
    cabin: row.cabin,
    passengers: row.passengers,
    priceAtRequest: row.priceAtRequest != null ? parseFloat(row.priceAtRequest) : null,
    status,
    createdAt: row.createdAt.toISOString(),
    timeline: timeline.map((e) => ({
      status: e.status,
      at: e.createdAt.toISOString(),
      note: e.note,
    })),
  };
}
