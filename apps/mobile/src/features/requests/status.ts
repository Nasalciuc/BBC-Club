import type { RequestVM } from "@bbc/shared/api/v1/requests";

import { requestView } from "./request-view-logic";

/** Contract statuses → StatusBadge copy keys. Closed has no badge. */
export function badgeStatus(status: RequestVM["status"]): string | null {
  return requestView(status).badge;
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
