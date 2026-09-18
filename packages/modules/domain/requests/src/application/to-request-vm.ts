import { RequestVM as RequestVMSchema, type RequestVM } from "@bbc/shared/api/v1/requests";

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
    const parts = iso.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) return iso;
    const month = MONTHS[m - 1];
    return month ? `${month} ${d}` : iso;
  };
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (!first || !last) return "";
  if (legs.length === 1) return fmt(first.date);
  return `${fmt(first.date)}–${fmt(last.date)}`;
}

/** Map a DB row (+ optional timeline) to the shared RequestVM. Reference is blank until CRM echoes. */
export function toRequestVM(row: RequestRow, timeline: EventRow[] = []): RequestVM {
  const status = RequestVMSchema.shape.status.parse(!row.sentToCrm ? "not_sent" : row.status);
  const first = row.legs[0];
  const last = row.legs[row.legs.length - 1];

  return {
    id: row.id,
    reference: row.sentToCrm ? row.reference : "",
    route: first && last ? `${first.from} → ${last.to}` : "",
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
