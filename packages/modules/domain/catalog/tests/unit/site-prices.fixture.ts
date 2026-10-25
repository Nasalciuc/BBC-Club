/** The company's site's price search (ADR-IMPL-063), answered the way it answers: `{ premium_economy, business, first }`
 *  for a route it prices, 404 `Offer not found` / `Not found` where the company has none. Every figure here is made up. */
import type { Fetch } from "../../src/application/place-photo-sources";
import { SITE_SEARCH } from "../../src/pricing/site-check";

/** One route's answer: figures (made up), the company's "none" (`no_offer`, `unknown_airport`), or an HTTP status with
 *  a body, or a network failure (`throw`), or no answer until the request is aborted (`hang`), or a 200 whose body never
 *  comes (`hang-body`). */
export type FakeAnswer =
  | { business: number; first: number; premium_economy: number }
  | "no_offer"
  | "unknown_airport"
  | { status: number; body?: string }
  | "throw"
  | "hang"
  | "hang-body";

export type FakePriceSite = {
  /** `FROM-TO trip` → answer; a route not listed answers `unknown_airport`. */
  routes: Record<string, FakeAnswer>;
  /** Every request, as `FROM-TO trip` (with its User-Agent in `agents`). */
  calls: string[];
  agents: string[];
  /** Awaited once a request is counted, before it is answered: what a test does while a run is going. */
  onCall?: (key: string) => Promise<void> | void;
};

export function fakePriceSite(routes: Record<string, FakeAnswer> = {}): FakePriceSite & { fetch: Fetch } {
  const site: FakePriceSite = { routes, calls: [], agents: [] };
  const fetch: Fetch = async (url, init) => {
    const u = new URL(url);
    if (`${u.origin}${u.pathname}` !== SITE_SEARCH) return new Response("not here", { status: 404 });
    const key = `${u.searchParams.get("from")}-${u.searchParams.get("to")} ${u.searchParams.get("trip_type")}`;
    site.calls.push(key);
    site.agents.push(new Headers(init?.headers).get("user-agent") ?? "");
    await site.onCall?.(key);
    const answer = site.routes[key] ?? "unknown_airport";
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
    if (answer === "throw") throw new TypeError("fetch failed");
    if (answer === "hang") {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) return reject(signal.reason);
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }
    if (answer === "hang-body") {
      const signal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    }
    if (answer === "no_offer") return json(404, { error: "Offer not found" });
    if (answer === "unknown_airport") return json(404, { message: "Not found" });
    if ("status" in answer) return new Response(answer.body ?? "", { status: answer.status });
    return json(200, answer);
  };
  // The same object the fetch reads: a test may set `onCall` or change `routes` after handing `fetch` over.
  return Object.assign(site, { fetch });
}
