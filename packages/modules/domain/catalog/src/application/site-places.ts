/**
 * From the site's cities to our airports (ADR-IMPL-045). The site has names, not codes: a city is matched to the
 * airports whose city — or one of whose search terms — is its name, inside the country the site puts it in (London is
 * not London, Ontario; Victoria is the Seychelles' capital, not Victoria, BC). The few names that need help are listed
 * here by the site's own id. A city's photo is used only when it is its own: Crete's page shows Santorini's, and stays
 * on Wikimedia. Pure: no database, no network.
 */
import { COUNTRY_ALIASES } from "../infrastructure/airports.repo";
import { normalize } from "./place-photo-sources";
import type { SiteCity, SiteRead } from "./site-cms";

export type MappingAirport = {
  code: string;
  city: string;
  country: string;
  countryCode: string;
  searchTerms: string | null;
  popularity: number;
};

/** Destinations the names cannot find, by the site's id. An empty list: the city has no airport of its own. */
export const SITE_CITY_AIRPORTS: ReadonlyMap<number, readonly string[]> = new Map([
  [1553, ["BLR"]], // "Benglaru": Bengaluru, misspelled on the site
  [388, ["SGN"]], // "Ho Chi Minh": our city is "Ho Chi Minh City"
  [622, ["JRO"]], // "Kilimanjaro": the airport; the city is Arusha
  [1506, []], // "Kyoto": no airport of its own; KIX and ITM are Osaka's (290)
  [1153, ["HER", "CHQ", "JSH"]], // "Crete": an island, its three airports
  // Cities whose airports rank alike in the reference: the main one first, named (a pin, a price, a quote's route).
  [290, ["KIX", "ITM"]], // Osaka: Kansai, not Itami (domestic)
  [1282, ["OTP", "BBU"]], // Bucharest: Otopeni, not Băneasa
  [527, ["AMM", "ADJ"]], // Amman: Queen Alia, not Marka
  [1140, ["TFS", "TFN"]], // Tenerife: South, the international one
  [1490, ["TFU", "CTU"]], // Chengdu: Tianfu, the international one
  [436, ["CMB", "RML"]], // Colombo: Bandaranaike, not Ratmalana
  [996, ["GLA", "PIK"]], // Glasgow: Glasgow, not Prestwick
  [1312, ["TPE", "TSA"]], // Taipei: Taoyuan, not Songshan
]);

/** US cities the site lists prices from whose metro area has several airports. Any other: its busiest US airport. */
export const SITE_ORIGIN_AIRPORTS: ReadonlyMap<string, readonly string[]> = new Map([
  ["new york", ["JFK", "EWR", "LGA"]],
  ["washington", ["IAD", "DCA", "BWI"]],
  ["chicago", ["ORD", "MDW"]],
  ["houston", ["IAH", "HOU"]],
  ["dallas", ["DFW", "DAL"]],
]);

/** A city's photo is its own: `bestDeals/<its id>/image/<file>`, an image file name, nothing else. */
const OWN_IMAGE = /^bestDeals\/([0-9]+)\/image\/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/i;

export type ImageVerdict =
  { kind: "own"; path: string } | { kind: "borrowed"; path: string } | { kind: "odd"; path: string } | { kind: "none" };

/** Whose photo the page shows. A path in another city's folder is borrowed (Crete shows Santorini's); a path of any
 *  other shape is odd — never used, and reported. */
export function imageOf(city: Pick<SiteCity, "id" | "image">): ImageVerdict {
  const path = city.image;
  if (!path) return { kind: "none" };
  const m = OWN_IMAGE.exec(path);
  if (!m) return { kind: "odd", path };
  return Number(m[1]) === city.id ? { kind: "own", path } : { kind: "borrowed", path };
}

type Index = {
  byCode: Map<string, MappingAirport>;
  byCity: Map<string, MappingAirport[]>;
  byTerm: Map<string, MappingAirport[]>;
};

export function indexAirports(airports: readonly MappingAirport[]): Index {
  const byCode = new Map<string, MappingAirport>();
  const byCity = new Map<string, MappingAirport[]>();
  const byTerm = new Map<string, MappingAirport[]>();
  const push = (m: Map<string, MappingAirport[]>, k: string, a: MappingAirport) => {
    if (!k) return;
    const list = m.get(k);
    if (list) list.push(a);
    else m.set(k, [a]);
  };
  for (const a of airports) {
    const code = a.code.trim();
    const row = { ...a, code };
    byCode.set(code, row);
    push(byCity, normalize(a.city), row);
    for (const term of (a.searchTerms ?? "").split("|")) push(byTerm, normalize(term), row);
  }
  return { byCode, byCity, byTerm };
}

const busiestFirst = (a: MappingAirport, b: MappingAirport) =>
  b.popularity - a.popularity || a.code.localeCompare(b.code);

/** The site's country is the airport's: by name, or through the names members type for it (Turkiye → Turkey). */
function inCountry(a: MappingAirport, country: string): boolean {
  const n = normalize(country);
  const ours = normalize(a.country);
  return ours === n || normalize(COUNTRY_ALIASES[n] ?? "") === ours;
}

/**
 * A destination's airports, busiest first, or null when none could be told apart. Its name, as a city or a search term,
 * inside the site's country; when our country names differ from the site's, the city's own name in a single country.
 */
export function cityAirports(city: Pick<SiteCity, "id" | "name" | "country">, index: Index): string[] | null {
  const listed = SITE_CITY_AIRPORTS.get(city.id);
  if (listed) {
    // As listed: the first is the main airport (Heraklion, not Chania, though both rank alike).
    const known = listed.filter((c) => index.byCode.has(c));
    return known.length === 0 ? null : known;
  }
  const name = normalize(city.name);
  const byCity = index.byCity.get(name) ?? [];
  const byTerm = index.byTerm.get(name) ?? [];
  const there = (list: MappingAirport[]) => list.filter((a) => inCountry(a, city.country));
  const pick = there(byCity).length > 0 ? there(byCity) : there(byTerm);
  if (pick.length > 0) return [...new Set(pick)].sort(busiestFirst).map((a) => a.code);
  const countries = new Set(byCity.map((a) => a.countryCode));
  if (byCity.length > 0 && countries.size === 1) return [...byCity].sort(busiestFirst).map((a) => a.code);
  return null;
}

/** A US city the site lists a price from: its metro area's airports, else its busiest US airport, else none. */
export function originAirports(name: string, index: Index): string[] {
  const n = normalize(name);
  const listed = SITE_ORIGIN_AIRPORTS.get(n);
  if (listed) return listed.filter((c) => index.byCode.has(c));
  const [busiest] = (index.byCity.get(n) ?? []).filter((a) => a.countryCode === "US").sort(busiestFirst);
  return busiest ? [busiest.code] : [];
}

export type SitePlace = {
  cmsId: number;
  name: string;
  country: string;
  region: string;
  airport: string;
  airports: string[];
  promoted: boolean;
  image: string | null;
};

export type SiteRoute = {
  routeFrom: string;
  cmsId: number;
  deal: number;
  price: number;
  publishedPrice: number | null;
};

export type SitePlan = {
  places: SitePlace[];
  routes: SiteRoute[];
  /** Cities whose airports could not be told apart (or that have none). */
  unmapped: { id: number; name: string; country: string }[];
  /** Cities whose page shows another city's photo. */
  borrowed: { id: number; name: string; image: string }[];
  /** Cities whose photo path has another shape (never used). */
  odd: { id: number; name: string; image: string }[];
  /** Cities whose two busiest airports rank alike: the main one went to the first code — list the city. */
  ties: { id: number; name: string; airports: string[] }[];
  /** US city names the site lists that matched no airport. */
  unknownOrigins: string[];
};

/** The snapshot one night's read becomes. A route keeps the lowest price when two of a city's deals land on one airport. */
export function planSite(read: SiteRead, airports: readonly MappingAirport[]): SitePlan {
  const index = indexAirports(airports);
  const places: SitePlace[] = [];
  const routes = new Map<string, SiteRoute>();
  const unmapped: SitePlan["unmapped"] = [];
  const borrowed: SitePlan["borrowed"] = [];
  const odd: SitePlan["odd"] = [];
  const ties: SitePlan["ties"] = [];
  const unknownOrigins = new Set<string>();

  for (const city of [...read.cities].sort((a, b) => a.id - b.id)) {
    const codes = cityAirports(city, index);
    const main = codes?.[0];
    if (!codes || !main) {
      unmapped.push({ id: city.id, name: city.name, country: city.country });
      continue;
    }
    const second = codes[1];
    const rank = (code: string) => index.byCode.get(code)?.popularity;
    if (!SITE_CITY_AIRPORTS.has(city.id) && second && rank(main) === rank(second)) {
      ties.push({ id: city.id, name: city.name, airports: codes });
    }
    const image = imageOf(city);
    if (image.kind === "borrowed") borrowed.push({ id: city.id, name: city.name, image: image.path });
    if (image.kind === "odd") odd.push({ id: city.id, name: city.name, image: image.path });
    places.push({
      cmsId: city.id,
      name: city.name,
      country: city.country,
      region: city.region,
      airport: main,
      airports: codes,
      promoted: read.promoted.has(city.id),
      image: image.kind === "own" ? image.path : null,
    });
    for (const deal of city.deals) {
      if (deal.price === null) continue;
      const from = originAirports(deal.from, index);
      if (from.length === 0) unknownOrigins.add(deal.from);
      for (const code of from) {
        if (codes.includes(code)) continue;
        const key = `${code}:${city.id}`;
        const had = routes.get(key);
        if (had && had.price <= deal.price) continue;
        routes.set(key, {
          routeFrom: code,
          cmsId: city.id,
          deal: deal.id,
          price: deal.price,
          publishedPrice: deal.publishedPrice,
        });
      }
    }
  }
  return {
    places,
    routes: [...routes.values()],
    unmapped,
    borrowed,
    odd,
    ties,
    unknownOrigins: [...unknownOrigins].sort(),
  };
}
