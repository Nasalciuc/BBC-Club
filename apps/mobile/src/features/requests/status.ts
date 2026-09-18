import type { RequestVM } from "@bbc/shared/api/v1/requests";

/** Contract statuses → StatusBadge copy keys. Do not change shared or StatusBadge. */
export function badgeStatus(status: RequestVM["status"]): string {
  if (status === "quoted") return "quote_ready";
  if (status === "assigned") return "received";
  if (status === "closed") return "booked";
  return status;
}

export function isOpen(status: RequestVM["status"]): boolean {
  return status === "received" || status === "assigned" || status === "quoted" || status === "not_sent";
}

export function requestMeta(r: RequestVM): string {
  const cabin = r.cabin === "business" ? "Business" : "First";
  const adults = r.passengers.adult === 1 ? "1 adult" : `${r.passengers.adult} adults`;
  const price =
    r.priceAtRequest != null
      ? `from ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(r.priceAtRequest)}`
      : null;
  return [r.dates, cabin, adults, price].filter(Boolean).join(" · ");
}
