import { routeEnds } from "@bbc/shared/requests/display";

// The route rule lives in packages/shared, so the server and the app read a request the same way (ADR-IMPL-042).
export { requestRoute, routeEnds } from "@bbc/shared/requests/display";

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
