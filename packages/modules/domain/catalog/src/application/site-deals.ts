/**
 * The company site's deals as Home's "Offers to inspire" (ADR-IMPL-067). The site lists its prices from about 25 US
 * cities (`site_routes`, the snapshot read twice a day): a member sees the deals from their own airport and its metro
 * first, then — where those run out, or where the site sells nothing from home (Seattle, Toronto, Chișinău) — the deals
 * from the nearest city the site does sell from, by great-circle distance, each saying where it leaves from ("from New
 * York"). One deal per destination city: the nearest origin's. Pure: no database, no network.
 */
import { SAME_METRO_KM, distanceKm } from "../pricing/estimate";
import { SITE_ORIGIN_AIRPORTS } from "./site-places";

type Point = { lat: number; lng: number };

/** An airport the site lists deals from, where it is, and what its city is called. */
export type DealOrigin = { code: string; city: string; lat: number; lng: number };

/** The airports a member's deals may leave from, as one origin: a metro the site names (New York: JFK, EWR, LGA), or
 *  one airport. */
export type OriginMetro = {
  /** Its airports with deals, the one to take a deal from first: the member's own, then as the site's metro lists
   *  them (JFK before EWR), then by code. */
  airports: string[];
  /** What the card says after `from`: the site's name for the metro (`New York`), else the airport's city. */
  city: string;
  /** From the member's airport to the metro's nearest airport; 0 for the member's own metro. */
  km: number;
};

/** `new york` → `New York`: the site's own name for a metro, as SITE_ORIGIN_AIRPORTS keys it. */
const titled = (name: string) => name.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** The site's metro an airport belongs to, by its key in SITE_ORIGIN_AIRPORTS; none for a city of one airport. */
function metroOf(code: string): { key: string; listed: readonly string[] } | null {
  for (const [key, listed] of SITE_ORIGIN_AIRPORTS) if (listed.includes(code)) return { key, listed };
  return null;
}

/**
 * The site's origins as metros, nearest the member's airport first: the metro `home` belongs to (or `home` alone) at
 * 0 km, then every other by the great-circle distance to its nearest airport; a tie by name. A home the site sells
 * nothing from has no metro at 0 km: its nearest origin comes first.
 */
export function originMetros(home: { code: string } & Point, origins: readonly DealOrigin[]): OriginMetro[] {
  const homeMetro = metroOf(home.code);
  const groups = new Map<string, { city: string; listed: readonly string[]; members: DealOrigin[] }>();
  for (const o of origins) {
    const metro = metroOf(o.code);
    const key = metro ? `metro:${metro.key}` : `airport:${o.code}`;
    const group = groups.get(key) ?? {
      city: metro ? titled(metro.key) : o.city,
      listed: metro?.listed ?? [o.code],
      members: [],
    };
    group.members.push(o);
    groups.set(key, group);
  }
  const metros = [...groups.values()].map((g): OriginMetro => {
    const own = g.members.some((m) => m.code === home.code) || (homeMetro !== null && g.listed === homeMetro.listed);
    const rank = (code: string) =>
      code === home.code ? -1 : g.listed.indexOf(code) === -1 ? g.listed.length : g.listed.indexOf(code);
    return {
      airports: g.members.map((m) => m.code).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)),
      city: g.city,
      km: own ? 0 : Math.min(...g.members.map((m) => distanceKm(home, m))),
    };
  });
  return metros.sort((a, b) => a.km - b.km || a.city.localeCompare(b.city));
}

/** A deal as the catalog reads it: from one airport, to one of the site's cities (its main airport and every other). */
export type DealCandidate = {
  routeFrom: string;
  cmsId: number;
  /** Every airport of the destination city, its main one first. */
  airports: readonly string[];
  /** Where the destination's main airport is. */
  to: Point;
};

/**
 * Which deals a member sees, at most `limit`: the metros in `metros`' order (nearest first), each one's deals in the
 * order `candidates` come (the pins' order: the site's home page first, then the busiest); from a metro of several
 * airports, each city's deal from the airport its list prefers. A destination city once only — the nearest origin's
 * deal — and never the member's own city (an airport of it, or one under SAME_METRO_KM from home).
 */
export function pickDeals<T extends DealCandidate>(
  home: { code: string } & Point,
  metros: readonly OriginMetro[],
  candidates: readonly T[],
  limit: number,
): { deal: T; metro: OriginMetro }[] {
  if (limit <= 0) return [];
  const where = new Map<string, { metro: number; pref: number; of: OriginMetro }>();
  metros.forEach((m, metro) => m.airports.forEach((code, pref) => where.set(code, { metro, pref, of: m })));
  const firstSeen = new Map<number, number>();
  candidates.forEach((c, i) => {
    if (!firstSeen.has(c.cmsId)) firstSeen.set(c.cmsId, i);
  });
  const ranked = candidates
    .flatMap((deal) => {
      const at = where.get(deal.routeFrom);
      return at ? [{ deal, ...at, order: firstSeen.get(deal.cmsId) ?? 0 }] : [];
    })
    .sort((a, b) => a.metro - b.metro || a.order - b.order || a.pref - b.pref);

  const taken = new Set<string>();
  const out: { deal: T; metro: OriginMetro }[] = [];
  for (const r of ranked) {
    if (out.length >= limit) break;
    const { deal } = r;
    if (deal.airports.includes(home.code) || distanceKm(home, deal.to) < SAME_METRO_KM) continue;
    if (deal.airports.some((code) => taken.has(code))) continue;
    for (const code of deal.airports) taken.add(code);
    out.push({ deal, metro: r.of });
  }
  return out;
}

/**
 * How many metros, nearest first, may hold `limit` deals between them: their deal counts summed until they reach
 * `limit` (a city two metros both list counts twice here, so the reader asks again for the next metros when the pick
 * falls short). At least one, when there is one.
 */
export function metrosFor(metros: readonly OriginMetro[], counts: ReadonlyMap<string, number>, limit: number) {
  let total = 0;
  let n = 0;
  for (const m of metros) {
    n += 1;
    total += m.airports.reduce((sum, code) => Math.max(sum, counts.get(code) ?? 0), 0);
    if (total >= limit) break;
  }
  return n;
}
