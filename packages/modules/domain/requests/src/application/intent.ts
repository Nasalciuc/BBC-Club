/** What the operator is looking at. A stored intent wins; otherwise the source ids decide. */
export function effectiveIntent(row: {
  intent: string | null;
  fareId: string | null;
  offerId: string | null;
}): "quote" | "alternative" | "fare" | "offer" {
  if (row.intent === "quote" || row.intent === "alternative") return row.intent;
  return row.fareId ? "fare" : row.offerId ? "offer" : "quote";
}
