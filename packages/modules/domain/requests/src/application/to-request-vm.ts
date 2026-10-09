import { RequestVM as RequestVMSchema, type RequestVM } from "@bbc/shared/api/v1/requests";
import type { requests, requestEvents } from "@bbc/db/schema/requests";
import { requestRoute } from "./route";

type RequestRow = typeof requests.$inferSelect;
type EventRow = typeof requestEvents.$inferSelect;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The send-requests job stops after six attempts (`claimUnsent`); only then is a request "not sent" to its member. */
const SEND_ATTEMPTS = 6;

/** `Oct 12–19` (Figma 233:4069), `Oct 30–Nov 6` across months, `Nov 3` for one leg. */
function formatDates(legs: { date: string }[]): string {
  if (!legs.length) return "";
  const parts = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const month = m ? MONTHS[m - 1] : undefined;
    return y && month && d ? { year: y, month, day: d } : null;
  };
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (!first || !last) return "";
  const a = parts(first.date);
  if (!a) return first.date;
  if (legs.length === 1) return `${a.month} ${a.day}`;
  const b = parts(last.date);
  if (!b) return `${a.month} ${a.day}–${last.date}`;
  return a.year === b.year && a.month === b.month
    ? `${a.month} ${a.day}–${b.day}`
    : `${a.month} ${a.day}–${b.month} ${b.day}`;
}

/** Map a DB row (+ optional timeline, + the destination's city) to the shared RequestVM. Reference is blank until CRM
 *  echoes. */
export function toRequestVM(row: RequestRow, timeline: EventRow[] = [], city: string | null = null): RequestVM {
  // A request we hold but have not passed on yet is, to its member, received (Figma 233:4639: "Your request is with
  // us."): the job passes it on within the minute. It is "not sent" only once the job has given up.
  const unsent = row.sendAttempts >= SEND_ATTEMPTS ? "not_sent" : "received";
  const status = RequestVMSchema.shape.status.parse(row.sentToCrm ? row.status : unsent);

  return {
    id: row.id,
    reference: row.sentToCrm ? row.reference : "",
    route: requestRoute(row.legs, row.tripType),
    city,
    tripType: row.tripType,
    phone: row.phoneE164 ?? (row.contactPhone || null),
    dates: formatDates(row.legs),
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
