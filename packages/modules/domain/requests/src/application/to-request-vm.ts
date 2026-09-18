import type { RequestVM } from "@bbc/shared/api/v1/requests";

type RequestRow = {
  id: string;
  reference: string;
  memberId: string | null;
  legs: { from: string; to: string; date: string }[];
  passengers: { adult: number; child: number; infant: number };
  cabin: "business" | "first";
  priceAtRequest: string | null;
  status: string;
  sentToCrm: boolean;
  createdAt: Date;
};

type EventRow = {
  status: string;
  createdAt: Date;
  note: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDates(legs: { date: string }[]): string {
  if (!legs.length) return "";
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return `${MONTHS[m - 1]} ${d}`;
  };
  if (legs.length === 1) return fmt(legs[0]!.date);
  return `${fmt(legs[0]!.date)}–${fmt(legs[legs.length - 1]!.date)}`;
}

/** Map a DB row (+ optional timeline) to the shared RequestVM. Reference is blank until CRM echoes. */
export function toRequestVM(row: RequestRow, timeline: EventRow[] = []): RequestVM {
  const status: RequestVM["status"] = !row.sentToCrm ? "not_sent" : (row.status as RequestVM["status"]);

  return {
    id: row.id,
    reference: row.sentToCrm ? row.reference : "",
    route: row.legs.length ? `${row.legs[0]!.from} → ${row.legs[row.legs.length - 1]!.to}` : "",
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
