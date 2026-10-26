/**
 * A rule set against the company's site (ADR-IMPL-062). The site's own search,
 * `GET https://webapi.buybusinessclass.com/flights/search?from=&to=&trip_type=`, answers the formula with the company's
 * current rules: whole dollars per person, `{ premium_economy, business, first }`, for any route with an end in North
 * America. For a fixed sample of routes — two per continent pair, both trips, Istanbul and two codes with a Q among them —
 * it is asked one route at a time, and its business and first are compared with formulaPrice(rules, …). The result holds
 * counts and the routes that differ, never a price: the rules and the site's figures stay out of every log
 * (scripts/load-pricing-rules.ts `--check-site`). The rules pass only when no route differs and every route got the
 * site's business figure (`siteCheckVerdict`): a check the site half answered proves nothing.
 */
import { z } from "zod";

import { formulaPrice, type PricedAirport } from "./estimate";
import type { PricingRules, RulePair, RuleTrip } from "./rules";

export const SITE_SEARCH = "https://webapi.buybusinessclass.com/flights/search";
/** One request at a time, this far apart, each given this long. */
export const SITE_CHECK_GAP_MS = 500;
export const SITE_CHECK_TIMEOUT_MS = 5_000;

export type SiteCheckRoute = { pair: RulePair; from: PricedAirport; to: PricedAirport; trip: RuleTrip };

const at = (code: string, countryCode: string): PricedAirport => ({ code, countryCode });

/** Two routes per continent pair, from North America (the site prices LAX's one-way trips abroad its own way, so LAX
 *  is only a destination here). */
const ROUTES: readonly (readonly [RulePair, PricedAirport, PricedAirport])[] = [
  ["LOCAL", at("JFK", "US"), at("LAX", "US")],
  ["LOCAL", at("MIA", "US"), at("YQB", "CA")], // a code with a Q
  ["NA-EU", at("JFK", "US"), at("ZRH", "CH")], // the poster's route
  ["NA-EU", at("ORD", "US"), at("SVQ", "ES")], // a code with a Q
  ["NA-AS", at("JFK", "US"), at("IST", "TR")], // Turkey, priced as Asia
  ["NA-AS", at("SFO", "US"), at("NRT", "JP")],
  ["NA-AF", at("JFK", "US"), at("JNB", "ZA")],
  ["NA-AF", at("IAD", "US"), at("ADD", "ET")],
  ["NA-SA", at("MIA", "US"), at("GRU", "BR")],
  ["NA-SA", at("JFK", "US"), at("BOG", "CO")],
  ["NA-OC", at("SFO", "US"), at("SYD", "AU")],
  ["NA-OC", at("DFW", "US"), at("AKL", "NZ")],
];

/** The sample: every route above, round trip and one way — 24 requests. */
export const SITE_CHECK_SAMPLE: readonly SiteCheckRoute[] = ROUTES.flatMap(([pair, from, to]) =>
  (["round_trip", "one_way"] as const).map((trip) => ({ pair, from, to, trip })),
);

export const SITE_CHECK_CABINS = ["business", "first"] as const;
export type SiteCheckCabin = (typeof SITE_CHECK_CABINS)[number];
/** Per cabin: routes equal to the site's figure, different from it, or with no figure from the site. */
export type CabinTally = { matched: number; differed: number; noAnswer: number };
/** `differs` names the routes per cabin as `FROM-TO trip` — codes, never a price. */
export type SiteCheckResult = Record<SiteCheckCabin, CabinTally> & {
  differs: Record<SiteCheckCabin, string[]>;
};

export type SiteCheckDeps = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  userAgent: string;
  /** Waits between two requests; tests pass one that does not. */
  sleep?: (ms: number) => Promise<void>;
};

/** Each cabin a whole number of dollars, or missing (a cabin the site does not price is no answer for it). */
const Answer = z.object({ business: z.unknown(), first: z.unknown() }).passthrough();
const dollars = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

/** The site's figures for one route, or null when it gave none: no answer in time, not 200, not its shape. */
async function askSite(
  deps: SiteCheckDeps,
  route: SiteCheckRoute,
): Promise<Record<SiteCheckCabin, number | null> | null> {
  const query = new URLSearchParams({ from: route.from.code, to: route.to.code, trip_type: route.trip });
  let res: Response;
  try {
    res = await deps.fetch(`${SITE_SEARCH}?${query}`, {
      headers: { "User-Agent": deps.userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(SITE_CHECK_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  try {
    if (!res.ok) {
      await res.text();
      return null;
    }
    const parsed = Answer.safeParse(await res.json());
    return parsed.success ? { business: dollars(parsed.data.business), first: dollars(parsed.data.first) } : null;
  } catch {
    return null;
  }
}

/** Compares `rules` with the site on `sample`, one route at a time. Never throws for the site's sake. */
export async function checkRulesAgainstSite(
  rules: PricingRules,
  deps: SiteCheckDeps,
  sample: readonly SiteCheckRoute[] = SITE_CHECK_SAMPLE,
): Promise<SiteCheckResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const tally = (): CabinTally => ({ matched: 0, differed: 0, noAnswer: 0 });
  const result: SiteCheckResult = { business: tally(), first: tally(), differs: { business: [], first: [] } };
  for (const [i, route] of sample.entries()) {
    if (i > 0) await sleep(SITE_CHECK_GAP_MS);
    const site = await askSite(deps, route);
    for (const cabin of SITE_CHECK_CABINS) {
      const theirs = site?.[cabin] ?? null;
      if (theirs === null) {
        result[cabin].noAnswer += 1;
        continue;
      }
      if (formulaPrice(rules, route.from, route.to, route.trip, cabin) === theirs) {
        result[cabin].matched += 1;
      } else {
        result[cabin].differed += 1;
        result.differs[cabin].push(`${route.from.code}-${route.to.code} ${route.trip}`);
      }
    }
  }
  return result;
}

/** The lines the loader prints: counts per cabin and the routes that differ — never a price. */
export function siteCheckLines(result: SiteCheckResult): string[] {
  return SITE_CHECK_CABINS.flatMap((cabin) => {
    const t = result[cabin];
    const head = `site check — ${cabin}: ${t.matched} matched · ${t.differed} differed · ${t.noAnswer} no answer`;
    return result.differs[cabin].length > 0 ? [head, `  differ: ${result.differs[cabin].join(", ")}`] : [head];
  });
}

/**
 * Whether the rules pass: no route differs in either cabin, and the site gave its business figure for every route —
 * the site prices business on every route of the sample, so a route without it is one the check did not cover, and a
 * stale set could hide there (a timeout, a 404, the rate limit). First may go unanswered: a cabin the site does not
 * price is no difference. `problems` says why it fails, in counts — never a price.
 */
export function siteCheckVerdict(result: SiteCheckResult): { pass: boolean; problems: string[] } {
  const problems: string[] = [];
  const differed = result.business.differed + result.first.differed;
  const routes = result.business.matched + result.business.differed + result.business.noAnswer;
  if (routes === 0) problems.push("no route was asked — nothing compared");
  if (differed > 0) problems.push("these rules do not give the site's prices on the routes above");
  if (result.business.noAnswer > 0)
    problems.push(
      `the site gave no business figure for ${result.business.noAnswer} of ${routes} routes — not a pass; run it again`,
    );
  return { pass: problems.length === 0, problems };
}
