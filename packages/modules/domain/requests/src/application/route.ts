/**
 * The route a request is about (ADR-IMPL-042): the outbound leg for a round trip and a one-way trip (`JFK → LHR`); for
 * a multi-city trip, origin to its last stop before coming home. Never "first origin → last destination" for a round
 * trip — the last leg comes home, and that read `JFK → JFK` in the app, the quote-ready push and the operator's page.
 * `legs` is the stored jsonb, read defensively.
 */
export function routeEnds(legs: unknown, tripType: string | null | undefined): { from: string; to: string } | null {
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const first = legs[0] as { from?: unknown; to?: unknown } | null;
  const last = legs[legs.length - 1] as { from?: unknown; to?: unknown } | null;
  if (typeof first?.from !== "string") return null;
  if (tripType === "multi" && typeof last?.to === "string") {
    // A tour that ends at home is about where it went last, not about home.
    const to = last.to === first.from && typeof last.from === "string" ? last.from : last.to;
    return { from: first.from, to };
  }
  return typeof first.to === "string" ? { from: first.from, to: first.to } : null;
}

/** `JFK → LHR`, or "" when the legs say nothing usable. */
export function requestRoute(legs: unknown, tripType: string | null | undefined): string {
  const ends = routeEnds(legs, tripType);
  return ends ? `${ends.from} → ${ends.to}` : "";
}

/**
 * The destination's city for each request (Figma 233:4069: `London`), keyed by airport code — one batched read for a
 * page. A title decorates a request: a failed read is reported and answers no cities (the app falls back to the route),
 * so an answer — a just-created request above all — never fails for it.
 */
export async function destinationCities(
  rows: readonly { legs: unknown; tripType: string }[],
  getAirports: (codes: string[]) => Promise<readonly { code: string; city: string }[]>,
  onError: (err: unknown) => void,
): Promise<Map<string, string>> {
  const codes = [...new Set(rows.flatMap((r) => routeEnds(r.legs, r.tripType)?.to ?? []))];
  if (codes.length === 0) return new Map();
  try {
    const airports = await getAirports(codes);
    return new Map(airports.filter((a) => a.city.trim()).map((a) => [a.code, a.city]));
  } catch (err) {
    onError(err);
    return new Map();
  }
}
