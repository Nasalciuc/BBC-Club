import type { RequestVM } from "@bbc/shared/api/v1/requests";

/** In progress on Requests; the rest are Completed. A card's badge comes from `requestCard` (request-card.ts). */
export function isOpen(status: RequestVM["status"]): boolean {
  return status === "received" || status === "assigned" || status === "quoted" || status === "not_sent";
}
