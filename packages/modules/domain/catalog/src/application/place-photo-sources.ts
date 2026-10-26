/**
 * Where a city's photo comes from (ADR-IMPL-043). Wikidata names the city an airport serves and the photos its editors
 * chose for it (a night view first, then the main image); Wikimedia Commons says who took each one and under which
 * licence, and serves it at the two widths the app shows; Pexels, when the club holds a key, has one where Commons has
 * none. Each function here builds a request or reads an answer — the job (place-photos.ts) decides what to keep.
 */
import { z } from "zod";

import { distanceKm } from "../pricing/estimate";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type SourceDeps = { fetch: Fetch; userAgent: string; signal: AbortSignal };
export type Stage = "wikidata" | "commons" | "pexels";
export type Centre = { lat: number; lng: number };

/** A photo the app may show, as it is stored: two widths, the credit, the photo's own page. */
export type FoundPhoto = {
  cardUrl: string;
  heroUrl: string;
  author: string | null;
  license: string;
  link: string;
};

/**
 * A source did not answer, or answered something other than its documented shape. Never carries a key or a header.
 * `retryAfterS` is set on a 429 only: the source asked the club to wait that long (ADR-IMPL-064) — not a failure of the
 * place asked about.
 */
export class SourceError extends Error {
  constructor(
    readonly stage: Stage,
    message: string,
    readonly status?: number,
    readonly retryAfterS?: number,
  ) {
    super(`${stage}: ${message}`);
    this.name = "SourceError";
  }
}

/**
 * Eight seconds a request unless the caller says. A city photo run asks at most the airports' question, two searches by
 * name, Commons (two at once) and three Pexels questions — 56 s if each took its eight, past the job's 50 s: the run
 * starts a request only while it can end inside its budget (`PLACE_PHOTOS_REQUESTS_MS`, place-photos.ts).
 */
export const REQUEST_TIMEOUT_MS = 8_000;

/** A 429 without a Retry-After the club can read waits five minutes; one asking for more than a day waits a day. */
export const DEFAULT_RETRY_AFTER_S = 300;
export const MAX_RETRY_AFTER_S = 86_400;

/** The seconds a Retry-After asks for — a number of seconds or an HTTP date (RFC 9110 §10.2.3) — at least one. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number {
  const value = header?.trim() ?? "";
  let seconds = DEFAULT_RETRY_AFTER_S;
  if (/^\d{1,9}$/.test(value)) seconds = Number(value);
  else if (value !== "" && !Number.isNaN(Date.parse(value))) seconds = Math.ceil((Date.parse(value) - now) / 1000);
  return Math.min(Math.max(seconds, 1), MAX_RETRY_AFTER_S);
}

/** One request with the club's User-Agent (Wikimedia refuses anonymous clients). */
async function getJson(
  deps: SourceDeps,
  stage: Stage,
  url: string,
  init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: init.method ?? "GET",
      headers: { "User-Agent": deps.userAgent, Accept: "application/json", ...init.headers },
      ...(init.body === undefined ? {} : { body: init.body }),
      signal: AbortSignal.any([deps.signal, AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS)]),
    });
  } catch (err) {
    throw new SourceError(stage, err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) {
    await res.text().catch(() => "");
    // Wikimedia answers a client it wants slower with 429 and a Retry-After (WDQS: 1000 s during an outage; Commons:
    // 20–60 s): the caller waits that long, it does not count a failure (ADR-IMPL-064).
    if (res.status === 429) {
      throw new SourceError(stage, "HTTP 429", 429, retryAfterSeconds(res.headers.get("Retry-After")));
    }
    throw new SourceError(stage, `HTTP ${res.status}`, res.status);
  }
  try {
    return await res.json();
  } catch {
    throw new SourceError(stage, "the answer is not JSON");
  }
}

/** Lower case, no accents, words separated by single spaces: "Chișinău" and "chisinau" compare equal. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** `words` appears in `text` as whole words, in order. */
function hasWords(text: string, words: string): boolean {
  const w = normalize(words);
  return w.length > 0 && ` ${normalize(text)} `.includes(` ${w} `);
}

function isHttpsOn(url: string | undefined, host: (hostname: string) => boolean): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && host(u.hostname);
  } catch {
    return false;
  }
}

/** Landscape, from 1.2 to 2.4 wide for 1 high: a card is 16:9, the fare's photo a little wider than high. */
export const isLandscape = (width: number, height: number) =>
  height > 0 && width / height >= 1.2 && width / height <= 2.4;

// ── Wikidata ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";

/**
 * The airports with these IATA codes (P238), where each one is (P625), and the city it serves (P931): its English name,
 * where it is, its night view (P3451) and its main image (P18). One question for the whole run. The code is matched at
 * any rank (`p:P238/ps:P238`, not `wdt:`, which reads the best rank only): a code Wikidata keeps beside a newer one —
 * KIV, Chișinău's until 2024, now a normal-rank statement under the preferred RMO — still finds its airport.
 */
export function citySparql(codes: readonly string[]): string {
  for (const code of codes) if (!/^[A-Z]{3}$/.test(code)) throw new Error(`not an IATA code: ${code}`);
  return `SELECT ?iata ?airport ?airportCoord ?city ?cityLabel ?cityCoord ?night ?image WHERE {
  VALUES ?iata { ${codes.map((c) => `"${c}"`).join(" ")} }
  ?airport p:P238/ps:P238 ?iata .
  OPTIONAL { ?airport wdt:P625 ?airportCoord . }
  OPTIONAL {
    ?airport wdt:P931 ?city .
    OPTIONAL { ?city wdt:P625 ?cityCoord . }
    OPTIONAL { ?city wdt:P3451 ?night . }
    OPTIONAL { ?city wdt:P18 ?image . }
    OPTIONAL { ?city rdfs:label ?cityLabel . FILTER(LANG(?cityLabel) = "en") }
  }
}`;
}

const SparqlAnswer = z.object({
  results: z.object({
    bindings: z.array(z.record(z.object({ type: z.string(), value: z.string() }).passthrough())),
  }),
});
export type Binding = z.infer<typeof SparqlAnswer>["results"]["bindings"][number];

/** One SPARQL question to the Wikidata Query Service; its rows. `timeoutMs`: eight seconds unless the caller says. */
export async function askSparql(deps: SourceDeps, query: string, timeoutMs?: number): Promise<Binding[]> {
  const raw = await getJson(deps, "wikidata", WIKIDATA_SPARQL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
    body: new URLSearchParams({ query, format: "json" }).toString(),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  const parsed = SparqlAnswer.safeParse(raw);
  if (!parsed.success) throw new SourceError("wikidata", "unexpected answer");
  return parsed.data.results.bindings;
}

export function askWikidata(deps: SourceDeps, codes: readonly string[]): Promise<Binding[]> {
  return askSparql(deps, citySparql(codes));
}

/** A SPARQL string literal: quotes and backslashes escaped; a line break or another control character refused. */
export function sparqlString(text: string): string {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) throw new Error("a SPARQL string cannot hold a control character");
  }
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The words a city is searched by: a control character (a tab or a line break the airports' import kept inside the
 * name) read as a space, spaces collapsed. Empty: nothing to search for. A person types no tab; the search would not
 * find one either, and a name the question cannot carry must never stop a run (ADR-IMPL-064).
 */
export function searchName(city: string): string {
  return city
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The places named like this city on Wikidata (its search, as a person would type the name: accents, aliases and other
 * spellings find it — "Chisinau" finds Chișinău), that are a human settlement (P31/P279* Q486972) with a place on Earth:
 * each one's English name, where it is, its night view and its main image, and its place in the search's own order
 * (`?rank`, 0 first: a name or an alias that matches whole comes before one that only starts with it). For a place
 * whose airport Wikidata does not know near ours. One question per place: the search service reads the first row of a
 * VALUES block only (tried on WDQS, 25 Oct 2026). The name is `searchName`'s.
 */
export function cityByNameSparql(place: { code: string; city: string }): string {
  if (!/^[A-Z]{3}$/.test(place.code)) throw new Error(`not an IATA code: ${place.code}`);
  return `SELECT ?code ?city ?cityLabel ?cityCoord ?night ?image ?rank WHERE {
  VALUES (?code ?name) { (${sparqlString(place.code)} ${sparqlString(searchName(place.city))}) }
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "www.wikidata.org" ;
                    wikibase:api "EntitySearch" ;
                    wikibase:limit 10 ;
                    mwapi:search ?name ;
                    mwapi:language "en" .
    ?city wikibase:apiOutputItem mwapi:item .
    ?rank wikibase:apiOrdinal true .
  }
  ?city wdt:P625 ?cityCoord .
  FILTER EXISTS { ?city wdt:P31/wdt:P279* wd:Q486972 . }
  OPTIONAL { ?city wdt:P3451 ?night . }
  OPTIONAL { ?city wdt:P18 ?image . }
  OPTIONAL { ?city rdfs:label ?cityLabel . FILTER(LANG(?cityLabel) = "en") }
}`;
}

/** "Point(-0.1275 51.507222)" — longitude first. A point on another globe carries a prefix and is refused. */
export function parsePoint(wkt: string | undefined): Centre | null {
  const m = wkt?.match(/^Point\(\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*\)$/);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** "http://commons.wikimedia.org/wiki/Special:FilePath/London%20Skyline.jpg" → "London Skyline.jpg"; null otherwise. */
export function commonsFileName(uri: string | undefined): string | null {
  const encoded = uri?.match(/^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/(.+)$/)?.[1];
  if (!encoded) return null;
  let name: string;
  try {
    name = decodeURIComponent(encoded).replace(/_/g, " ").trim();
  } catch {
    return null;
  }
  return name.length > 0 && name.length <= 240 && !/[|#<>[\]{}]/.test(name) ? name : null;
}

const qNumber = (uri: string) => Number(uri.match(/\/Q(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
/** Lower first; a city without a rank after those with one, two without a rank equal. */
const byRank = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

/** Files whose name says they are not a photograph of the city: a montage, a map, a flag, a coat of arms… */
const NOT_A_VIEW =
  /\b(montage|collage|composite|mosaic|maps?|flag|coat of arms|wappen|logo|seal|emblem|locator|location|banner|diagram|plan)\b/;

export type CityFacts = {
  /** The city's Wikidata item ("Q21197"), when one was found. */
  qid: string | null;
  /** Candidate files, best first: night views, then main images. At most three. */
  files: string[];
  /** The city's centre, when Wikidata knows it and it lies within 150 km of the airport. */
  centre: Centre | null;
};

const NO_CITY: CityFacts = { qid: null, files: [], centre: null };

const qidOf = (uri: string | undefined) =>
  uri?.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/)?.[1] ?? null;

/** What a chosen city item says: its night views then its main images, files named as no view left out, three at
 *  most; its centre within 150 km of the airport. */
function factsOf(
  qid: string,
  city: { centre: Centre | null; nights: Set<string>; images: Set<string> },
  place: { lat: number; lng: number },
): CityFacts {
  const views = (names: Set<string>) =>
    [...names].sort().filter((name) => !NOT_A_VIEW.test(normalize(name.replace(/\.[a-z0-9]+$/i, ""))));
  const files = [...new Set([...views(city.nights), ...views(city.images)])].slice(0, 3);
  const centre = city.centre && distanceKm(city.centre, place) <= CITY_NEAR_KM ? city.centre : null;
  return { qid, files, centre };
}

/** A Wikidata airport is ours when it lies within this distance of our coordinates. */
export const SAME_AIRPORT_KM = 50;
/** A city's centre further than this from its airport is not where the satellite view goes. */
export const CITY_NEAR_KM = 150;

/**
 * What Wikidata says about the city behind one airport. When a code names several items, ours is the closest within
 * 50 km of our coordinates; none within 50 km — nothing. When an airport serves several cities, the one whose English
 * name is the city we show wins, else the oldest item (the lowest Q number: London is Q84).
 */
export function cityFacts(
  bindings: readonly Binding[],
  place: { code: string; city: string; lat: number; lng: number },
): CityFacts {
  const rows = bindings.filter((b) => b.iata?.value === place.code);
  const points = new Map<string, Centre>();
  for (const b of rows) {
    const point = parsePoint(b.airportCoord?.value);
    if (b.airport?.value && point && !points.has(b.airport.value)) points.set(b.airport.value, point);
  }
  let airport: string | null = null;
  let nearest = SAME_AIRPORT_KM;
  for (const [id, point] of points) {
    const km = distanceKm(point, place);
    if (km <= nearest) {
      nearest = km;
      airport = id;
    }
  }
  if (!airport) return NO_CITY;

  const cities = citiesIn(rows.filter((b) => b.airport?.value === airport));
  const ours = (label: string | null) => (label !== null && normalize(label) === normalize(place.city) ? 0 : 1);
  const [chosen] = [...cities.entries()].sort(
    ([a, ca], [b, cb]) => ours(ca.label) - ours(cb.label) || qNumber(a) - qNumber(b),
  );
  if (!chosen) return NO_CITY;
  const qid = qidOf(chosen[0]);
  return qid ? factsOf(qid, chosen[1], place) : NO_CITY;
}

type CityRows = {
  label: string | null;
  centre: Centre | null;
  nights: Set<string>;
  images: Set<string>;
  /** Its place in the search's order (0 first); none outside a search's answer. */
  rank: number;
};

/** The cities in a SPARQL answer, by item: the name, the centre, the search's order and the files their rows carry. */
function citiesIn(rows: readonly Binding[]): Map<string, CityRows> {
  const cities = new Map<string, CityRows>();
  for (const b of rows) {
    if (!b.city?.value) continue;
    const city = cities.get(b.city.value) ?? {
      label: null,
      centre: null,
      nights: new Set(),
      images: new Set(),
      rank: Infinity,
    };
    city.label ??= b.cityLabel?.value ?? null;
    city.centre ??= parsePoint(b.cityCoord?.value);
    const rank = b.rank?.value === undefined ? NaN : Number(b.rank.value);
    if (Number.isInteger(rank) && rank >= 0) city.rank = Math.min(city.rank, rank);
    const night = commonsFileName(b.night?.value);
    if (night) city.nights.add(night);
    const image = commonsFileName(b.image?.value);
    if (image) city.images.add(image);
    cities.set(b.city.value, city);
  }
  return cities;
}

/**
 * The city behind a place found by its name (`cityByNameSparql`): among the settlements the search gave within 150 km
 * of the airport (a "Springfield" a thousand kilometres away is another city), the one whose English name is the city
 * we show; else the one the search put first — a name kept as an alias ("Kishinev") finds the city before a place
 * whose name only starts with it (the Chișinău Ghetto, nearer the airport); then the nearest, then the oldest item.
 * Nothing when none lies that near.
 */
export function cityFactsByName(
  bindings: readonly Binding[],
  place: { code: string; city: string; lat: number; lng: number },
): CityFacts {
  const cities = citiesIn(bindings.filter((b) => b.code?.value === place.code));
  const ours = (label: string | null) => (label !== null && normalize(label) === normalize(place.city) ? 0 : 1);
  const near = [...cities.entries()]
    .flatMap(([id, city]) => {
      const km = city.centre ? distanceKm(city.centre, place) : Infinity;
      return km <= CITY_NEAR_KM ? [{ id, city, km }] : [];
    })
    .sort(
      (a, b) =>
        ours(a.city.label) - ours(b.city.label) ||
        byRank(a.city.rank, b.city.rank) ||
        a.km - b.km ||
        qNumber(a.id) - qNumber(b.id),
    );
  const chosen = near[0];
  const qid = chosen ? qidOf(chosen.id) : null;
  return chosen && qid ? factsOf(qid, chosen.city, place) : NO_CITY;
}

export async function askCityByName(
  deps: SourceDeps,
  place: { code: string; city: string; lat: number; lng: number },
): Promise<CityFacts> {
  return cityFactsByName(await askSparql(deps, cityByNameSparql(place)), place);
}

/**
 * The city behind each place (ADR-IMPL-043, ADR-IMPL-064): by its airport — one question for all of them — else, for at
 * most `searches` places whose airport Wikidata does not know near ours or names no city, by the city's own name near
 * the airport (one question each). A place whose name leaves nothing to search for has no city, without a question.
 * A search that fails is that place's failure alone: the place is in `failed` (`error` says why) and the places still
 * waiting for a search are in `later`, as are those past the searches — the run asks the search nothing more; none of
 * these is in `facts`. A place whose search found nothing has no city. A search starts only while `canAsk` says one can
 * still end inside the run's budget; a place it cannot is in `later`. Throws `SourceError` when the airports' question
 * fails, and on a 429 from any question (it carries its Retry-After: the whole run waits for it).
 */
export async function findCities(
  deps: SourceDeps,
  places: readonly { code: string; city: string; lat: number; lng: number }[],
  searches: number,
  canAsk: () => boolean = () => true,
): Promise<{ facts: Map<string, CityFacts>; later: string[]; failed: string[]; error?: SourceError }> {
  const bindings = await askWikidata(
    deps,
    places.map((p) => p.code),
  );
  const facts = new Map<string, CityFacts>();
  const later: string[] = [];
  const failed: string[] = [];
  let error: SourceError | undefined;
  let searched = 0;
  for (const place of places) {
    const byAirport = cityFacts(bindings, place);
    if (byAirport.qid !== null) {
      facts.set(place.code, byAirport);
    } else if (searchName(place.city) === "") {
      facts.set(place.code, NO_CITY);
    } else if (error === undefined && searched < searches && canAsk()) {
      searched += 1;
      try {
        facts.set(place.code, await askCityByName(deps, place));
      } catch (err) {
        if (!(err instanceof SourceError) || err.retryAfterS !== undefined) throw err;
        error = err;
        failed.push(place.code);
      }
    } else {
      later.push(place.code);
    }
  }
  return { facts, later, failed, ...(error === undefined ? {} : { error }) };
}

// ── Wikimedia Commons ────────────────────────────────────────────────────────────────────────────────────────────────

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** Two of Wikimedia's standard thumbnail widths (another width is refused or slowed): a card, a full-width photo. */
export const CARD_WIDTH = 500;
export const HERO_WIDTH = 1280;

/** The metadata a city photo is judged and credited by. */
export const PHOTO_METADATA = "Artist|LicenseShortName|AttributionRequired|Restrictions";

export function commonsUrl(
  files: readonly string[],
  width: number,
  metadata: boolean,
  fields: string = PHOTO_METADATA,
): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "imageinfo",
    iiprop: metadata ? "url|size|mime|extmetadata" : "url",
    iiurlwidth: String(width),
    titles: files.map((f) => `File:${f}`).join("|"),
  });
  if (metadata) {
    params.set("iiextmetadatafilter", fields);
    params.set("iiextmetadatalanguage", "en");
  }
  return `${COMMONS_API}?${params.toString()}`;
}

const ImageInfo = z
  .object({
    thumburl: z.string().optional(),
    thumbwidth: z.number().optional(),
    thumbheight: z.number().optional(),
    descriptionurl: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    mime: z.string().optional(),
    extmetadata: z.record(z.object({ value: z.unknown() }).passthrough()).optional(),
  })
  .passthrough();
export type ImageInfo = z.infer<typeof ImageInfo>;

const Renamed = z.array(z.object({ from: z.string(), to: z.string() }).passthrough()).optional();
const CommonsAnswer = z.object({
  /** MediaWiki reports its own failures (a database error, a timeout) with HTTP 200 and this key. */
  error: z.object({ code: z.string().optional() }).passthrough().optional(),
  query: z
    .object({
      normalized: Renamed,
      redirects: Renamed,
      pages: z
        .array(
          z
            .object({ title: z.string(), missing: z.boolean().optional(), imageinfo: z.array(ImageInfo).optional() })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough()
    .optional(),
});

/** What Commons says about each file, by the name asked (a missing file is absent). At most 50 titles a question. */
export async function askCommons(
  deps: SourceDeps,
  files: readonly string[],
  width: number,
  metadata: boolean,
  fields?: string,
): Promise<Map<string, ImageInfo>> {
  const out = new Map<string, ImageInfo>();
  for (let i = 0; i < files.length; i += 50) {
    const chunk = files.slice(i, i + 50);
    const parsed = CommonsAnswer.safeParse(await getJson(deps, "commons", commonsUrl(chunk, width, metadata, fields)));
    if (!parsed.success) throw new SourceError("commons", "unexpected answer");
    // An answer without pages is a failure, never "no photo": a city keeps what it has (ADR-IMPL-043).
    if (parsed.data.error) throw new SourceError("commons", `API error ${parsed.data.error.code ?? "unknown"}`);
    const query = parsed.data.query;
    if (!query?.pages) throw new SourceError("commons", "the answer has no pages");
    // A page's title is the asked name after Commons normalised it ("File:london.jpg" → "File:London.jpg") and
    // followed a redirect (a renamed file): walk both back to the name asked.
    const unnormalized = new Map((query.normalized ?? []).map((n) => [n.to, n.from]));
    const unredirected = new Map((query.redirects ?? []).map((r) => [r.to, r.from]));
    for (const page of query.pages) {
      const info = page.imageinfo?.[0];
      if (page.missing || !info) continue;
      const before = unredirected.get(page.title) ?? page.title;
      const asked = (unnormalized.get(before) ?? before).replace(/^File:/, "").replace(/_/g, " ");
      if (chunk.includes(asked)) out.set(asked, info);
    }
  }
  return out;
}

/** A numeric character reference's character; nothing for a number that names none. */
function character(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
    ? String.fromCodePoint(code)
    : "";
}

/** The text of an extmetadata field: HTML tags dropped, entities read once (`&amp;` last), spaces collapsed. */
export function metadataText(info: ImageInfo, field: string): string | null {
  const value = info.extmetadata?.[field]?.value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d{1,7});/g, (_, digits: string) => character(Number(digits)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => character(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * Free licences whose terms a credit line meets: CC0, public domain, CC BY / BY-SA, and the Free Art License (Commons'
 * `FAL`, "Free Art License 1.3"), which asks what CC BY-SA asks — the author, and where to find the licence (the photo's
 * Commons page names both; a landmark's credit carries the licence's address too) — ADR-IMPL-064, amendment 2. GFDL
 * alone asks for the whole licence text beside the photo: no.
 */
const FREE_LICENCE =
  /^(CC0( 1\.0)?|Public domain|CC BY(-SA)? \d(\.\d)?( [A-Za-z-]+)?|FAL( \d(\.\d)?)?|Free Art Licen[cs]e( \d(\.\d)?)?)$/i;

/** On Wikimedia's own hosts, over https. */
export const onWikimedia = (url: string | undefined) =>
  isHttpsOn(url, (h) => h === "wikimedia.org" || h.endsWith(".wikimedia.org"));

/**
 * A Commons file the app may show: a JPEG photograph in landscape, wider than the full-width thumbnail (so both widths
 * are real thumbnails, never the original), under a free licence, without restrictions (personality rights,
 * trademarks), with an author whenever the licence asks for one. `hero` is the answer at 1280 px with the metadata,
 * `card` the answer at 500 px. A TIFF stays out even when Commons serves its thumbnails as JPEG: on Commons TIFF
 * originals are mostly scans and remote-sensing products, and the one a site city had was a satellite image
 * (ADR-IMPL-064, amendment 3, withdrawn). PNG, SVG and GIF stay out: drawings, maps and screenshots.
 */
export function acceptCommons(hero: ImageInfo | undefined, card: ImageInfo | undefined): FoundPhoto | null {
  if (!hero || !card) return null;
  if (hero.mime !== "image/jpeg" || !hero.width || !hero.height || hero.width <= HERO_WIDTH) return null;
  if (!isLandscape(hero.width, hero.height)) return null;
  if (hero.thumbwidth !== HERO_WIDTH || card.thumbwidth !== CARD_WIDTH) return null;
  const heroUrl = hero.thumburl;
  const cardUrl = card.thumburl;
  if (!heroUrl || !cardUrl || !onWikimedia(heroUrl) || !onWikimedia(cardUrl)) return null;
  const credit = commonsCredit(hero);
  return credit ? { cardUrl, heroUrl, ...credit } : null;
}

/**
 * The credit a Commons file may be shown with (ADR-IMPL-043): its page on Commons, a free licence (CC0, public domain,
 * CC BY or BY-SA, or the Free Art License — ADR-IMPL-064, amendment 2), no restrictions (personality rights,
 * trademarks), and an author — Artist as text, 80 characters at most — whenever the licence asks for one (all but CC0
 * and public domain). Shared by the city photo and the landmarks. Null: the file may not be shown.
 */
export function commonsCredit(info: ImageInfo): { author: string | null; license: string; link: string } | null {
  const link = info.descriptionurl;
  if (!link || !isHttpsOn(link, (h) => h === "commons.wikimedia.org")) return null;
  const license = metadataText(info, "LicenseShortName");
  if (!license || !FREE_LICENCE.test(license)) return null;
  if (metadataText(info, "Restrictions")) return null;
  const artist = metadataText(info, "Artist");
  const author = artist ? (artist.length > 80 ? `${artist.slice(0, 79).trimEnd()}…` : artist) : null;
  const free = /^(CC0|Public domain)/i.test(license);
  if (!free && !author) return null;
  return { author, license, link };
}

/** A Commons file's own page, from its name: "Eiffel Tower.jpg" → ".../wiki/File:Eiffel_Tower.jpg" on Commons. */
export function commonsPage(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.trim().replace(/ /g, "_"))}`;
}

/**
 * The same Commons thumbnail at another of Wikimedia's standard widths — ".../thumb/a/ab/X.jpg/1280px-X.jpg" at 500 is
 * ".../thumb/a/ab/X.jpg/500px-X.jpg", its query kept. Null for an address on no Wikimedia host or not shaped so.
 */
export function commonsThumbAt(url: string, width: number): string | null {
  if (!onWikimedia(url)) return null;
  const u = new URL(url);
  const m = u.pathname.match(/^(\/(?:[^/]+\/)*thumb\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\/)\d+px-([^/]+)$/);
  if (!m) return null;
  u.pathname = `${m[1]}${width}px-${m[2]}`;
  return u.toString();
}

// ── Pexels ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const PEXELS_SEARCH = "https://api.pexels.com/v1/search";

export function pexelsUrl(city: string): string {
  const params = new URLSearchParams({
    query: `${city} skyline`,
    orientation: "landscape",
    size: "medium",
    per_page: "15",
  });
  return `${PEXELS_SEARCH}?${params.toString()}`;
}

const PexelsAnswer = z.object({
  photos: z.array(
    z
      .object({
        width: z.number(),
        height: z.number(),
        url: z.string(),
        photographer: z.string(),
        alt: z.string().nullable().optional(),
        src: z.object({ large: z.string(), large2x: z.string() }).passthrough(),
      })
      .passthrough(),
  ),
});

/** People are not the club's material (design/components.md, Photography): a photo's description gives them away. */
const PEOPLE =
  /\b(woman|women|man|men|people|person|girl|girls|boy|boys|couple|child|children|kid|kids|crowd|tourist|tourists|portrait|selfie|bride|groom)\b/;

/**
 * The first landscape photo whose description names the city and no person. Pexels answers every city's search with
 * something: a photo whose description does not name the city is somewhere else.
 */
export function pickPexels(raw: unknown, city: string): FoundPhoto | null {
  const parsed = PexelsAnswer.safeParse(raw);
  if (!parsed.success) throw new SourceError("pexels", "unexpected answer");
  const onPexels = (url: string) => isHttpsOn(url, (h) => h === "images.pexels.com");
  for (const p of parsed.data.photos) {
    const alt = p.alt ?? "";
    if (!hasWords(alt, city) || PEOPLE.test(normalize(alt))) continue;
    if (!isLandscape(p.width, p.height)) continue;
    if (!onPexels(p.src.large) || !onPexels(p.src.large2x)) continue;
    if (!isHttpsOn(p.url, (h) => h === "www.pexels.com" || h === "pexels.com")) continue;
    const name = p.photographer.trim();
    return {
      cardUrl: p.src.large,
      heroUrl: p.src.large2x,
      author: name.length > 0 ? name.slice(0, 80) : null,
      license: "Pexels License",
      link: p.url,
    };
  }
  return null;
}

export async function askPexels(deps: SourceDeps, key: string, city: string): Promise<FoundPhoto | null> {
  return pickPexels(await getJson(deps, "pexels", pexelsUrl(city), { headers: { Authorization: key } }), city);
}
