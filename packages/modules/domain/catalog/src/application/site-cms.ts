/**
 * The company's site (ADR-IMPL-045), read through its own API — buybusinessclass.com/api, the backend the site reads
 * (it answered at weba.buybusinessclass.com until that name stopped resolving; ADR-IMPL-062). Seven regions; each
 * region's countries; each country's cities; a city's page carries its photo, the US cities the site lists a price from,
 * and where it sits (region › country › city). Read-only, once a night, with the club's User-Agent: at most four
 * requests at a time, the API's paced to its rate limit (`API_GAP_MS`). The site has no IATA codes: site-places.ts finds
 * the airports.
 */
import { z } from "zod";

import type { Fetch } from "./place-photo-sources";

export const SITE_API = "https://buybusinessclass.com";
/** Where the site serves its images: a city's photo is `${SITE_STORAGE}bestDeals/<id>/image/<file>`. */
export const SITE_STORAGE = `${SITE_API}/storage/`;
/** Where it served them before (ADR-IMPL-062): photo rows stored under it are still the site's, for the sync to replace
 *  or hand back — never an operator's photo. */
export const LEGACY_SITE_STORAGE = "https://weba.buybusinessclass.com/storage/";
/** Every address a site photo row may start with: today's first. */
export const SITE_STORAGE_PREFIXES: readonly string[] = [SITE_STORAGE, LEGACY_SITE_STORAGE];

/**
 * The site's API answers at most 120 requests a minute per IP (`x-ratelimit-limit: 120`, a 60-s window). The read
 * starts one API request every 1.2 s across all its workers — about 50 a minute — so a run's ~240 pages take about
 * five minutes. The budget is the address's, not the read's: staging and production share one host and the same cron
 * (07:40 and 19:40 UTC), and two reads at about 50 a minute each stay under the 120 together, with no 429 to wait out. Photos
 * (`/storage`) have no stated limit and are not paced.
 */
export const API_GAP_MS = 1200;
/** A 429 waits what its Retry-After says (seconds or a date), 60 s without one, never more than 120 — then asks once
 *  more. */
const RETRY_AFTER_DEFAULT_S = 60;
const RETRY_AFTER_MAX_S = 120;

/** Time, for the API's pacing. The system's by default; tests pass their own, so nothing really waits. */
export type SiteClock = {
  now(): number;
  /** Resolves after `ms`; rejects with the signal's reason when it aborts first. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
};

export const systemClock: SiteClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      const stop = () => reject(signal.reason ?? new Error("aborted"));
      if (signal.aborted) return stop();
      const onAbort = () => {
        clearTimeout(timer);
        stop();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    }),
};

/** One API request start every `gapMs`, whichever worker asks; `hold` keeps every worker back until then (a 429). */
export type SitePacer = { wait(signal: AbortSignal): Promise<void>; hold(ms: number): void };

export function sitePacer(clock: SiteClock = systemClock, gapMs = API_GAP_MS): SitePacer {
  let next = Number.NEGATIVE_INFINITY;
  return {
    async wait(signal) {
      // A worker that wakes to find the slot taken (or a hold since) waits again: starts never come closer than gapMs.
      for (;;) {
        const now = clock.now();
        if (now >= next) {
          next = now + gapMs;
          return;
        }
        await clock.sleep(next - now, signal);
      }
    },
    hold(ms) {
      next = Math.max(next, clock.now() + ms);
    },
  };
}

/** How long a 429 asks to wait, in ms: Retry-After in seconds or as an HTTP date; 60 s without a readable one; at most
 *  120 s. */
export function retryAfterMs(header: string | null, now: number): number {
  const value = header?.trim() ?? "";
  let seconds = RETRY_AFTER_DEFAULT_S;
  if (/^\d+$/.test(value)) {
    seconds = Number(value);
  } else if (/^[a-z]{3}/i.test(value) && Number.isFinite(Date.parse(value))) {
    // An HTTP date starts with its day's name (RFC 9110: "Sun, 06 Nov 1994 08:49:37 GMT", and the two older forms).
    seconds = Math.max(0, (Date.parse(value) - now) / 1000);
  }
  return Math.min(seconds, RETRY_AFTER_MAX_S) * 1000;
}

export type SiteDeps = {
  fetch: Fetch;
  userAgent: string;
  signal: AbortSignal;
  /** Requests in flight at once: four by default. The API's are paced besides (`API_GAP_MS`); photos are not. */
  concurrency?: number;
  /** The clock the API's pacing waits on: the system's by default. */
  clock?: SiteClock;
};

/** The site did not answer, or answered something other than its shape. Names the page, never a header. */
export class SiteError extends Error {
  constructor(
    readonly page: string,
    message: string,
    readonly status?: number,
  ) {
    super(`site ${page}: ${message}`);
    this.name = "SiteError";
  }
}

/** One price the site lists for a city: from a US city, today and before. Whole dollars, or null when it has none. */
export type SiteDeal = { id: number; from: string; price: number | null; publishedPrice: number | null };

/** A city as its page gives it. `image` is the page's own path, unchecked (site-places.ts decides). */
export type SiteCity = {
  id: number;
  name: string;
  country: string;
  region: string;
  image: string | null;
  deals: SiteDeal[];
};

/** What one night's read found. `failed`: cities listed by their country whose own page did not answer. */
export type SiteRead = { cities: SiteCity[]; failed: number[]; promoted: ReadonlySet<number> };

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;

/** A whole, positive number of dollars, from a number or a numeric string; anything else is no price. */
export function dollars(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const whole = Math.round(n);
  return whole > 0 ? whole : null;
}

const Entry = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    type: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    price_today: z.unknown().optional(),
    old_price: z.unknown().optional(),
  })
  .passthrough();

/** The site's envelope: `{ responseCode: { responseCode: "1" }, data }`. Anything but "1" is a failure. */
const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ responseCode: z.object({ responseCode: z.union([z.literal("1"), z.literal(1)]) }), data });

const Page = envelope(
  z
    .object({
      type: z.enum(["region", "country", "city"]),
      bestDeals: z.array(Entry).nullable().optional(),
      image: z.string().nullable().optional(),
      selector: z
        .object({ bloodline: z.array(z.object({ id: z.number().int().positive(), name: z.string() })) })
        .passthrough(),
    })
    .passthrough(),
);
type Page = z.infer<typeof Page>["data"];

const List = envelope(z.array(Entry));

/** `fn` over `items`, at most `n` at once; the results in the items' order. The first failure is thrown. */
export async function inPool<T, R>(items: readonly T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i] as T);
      } catch (err) {
        stopped = true; // no new request once one has failed
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

/** One night's read of the API: the deps, the clock and the one pacer every worker shares. */
type Api = SiteDeps & { clock: SiteClock; pacer: SitePacer };

/** One API request, in its turn (the pacer). */
async function ask(api: Api, page: string, url: string): Promise<Response> {
  await api.pacer.wait(api.signal);
  try {
    return await api.fetch(url, {
      headers: { "User-Agent": api.userAgent, Accept: "application/json" },
      signal: AbortSignal.any([api.signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch (err) {
    throw new SiteError(page, err instanceof Error ? err.message : String(err));
  }
}

async function getJson<T extends z.ZodTypeAny>(api: Api, page: string, url: string, shape: T): Promise<z.infer<T>> {
  let res = await ask(api, page, url);
  if (res.status === 429) {
    // Over the site's rate limit: every worker waits what it asks (at most two minutes), then this page is asked once
    // more. A second 429 ends the read (readSite).
    const wait = retryAfterMs(res.headers.get("retry-after"), api.clock.now());
    await res.text().catch(() => "");
    api.pacer.hold(wait);
    res = await ask(api, page, url);
    if (res.status === 429) {
      await res.text().catch(() => "");
      throw new SiteError(page, "HTTP 429 again after waiting: the site's rate limit", 429);
    }
  }
  if (!res.ok) {
    await res.text().catch(() => "");
    throw new SiteError(page, `HTTP ${res.status}`, res.status);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new SiteError(page, "the answer is not JSON");
  }
  const parsed = shape.safeParse(body);
  if (!parsed.success) throw new SiteError(page, "the answer is not the site's shape");
  return parsed.data;
}

const pageOf = (api: Api, id: number): Promise<Page> =>
  getJson(api, `getOne?id=${id}`, `${SITE_API}/api/bestDeals/getOne?id=${id}`, Page).then((r) => r.data);

/** A city's page as the sync keeps it; null when the page is not a city with its region and country. The bloodline
 *  runs region › country › city: the first is the region, the last the city, the one before it the country. */
export function toSiteCity(id: number, page: Page): SiteCity | null {
  const line = page.selector.bloodline;
  const [region, country, city] = [line[0], line.at(-2), line.at(-1)];
  if (page.type !== "city" || line.length < 3 || !region || !country || !city) return null;
  return {
    id,
    name: city.name.trim(),
    country: country.name.trim(),
    region: region.name.trim(),
    image: page.image?.trim() || null,
    deals: (page.bestDeals ?? [])
      .filter((d) => !d.type)
      .map((d) => ({
        id: d.id,
        from: d.name.trim(),
        price: dollars(d.price_today),
        publishedPrice: dollars(d.old_price),
      })),
  };
}

/**
 * Regions → countries → cities, as the site lists them, then each city's own page — every API request in its turn
 * (`API_GAP_MS`). A region or a country that does not answer stops the read (which cities are gone could not be told
 * from which are missing), and so does the site's rate limit twice on one page; a city that does not answer otherwise
 * is listed in `failed`, and the sync keeps what it had for it.
 */
export async function readSite(deps: SiteDeps): Promise<SiteRead> {
  const clock = deps.clock ?? systemClock;
  // A read that fails stops its other workers with it: one still waiting its turn must not ask the site afterwards.
  const over = new AbortController();
  const signal = AbortSignal.any([deps.signal, over.signal]);
  const api: Api = { ...deps, signal, clock, pacer: sitePacer(clock) };
  try {
    return await readPages(api, deps.concurrency ?? CONCURRENCY, deps.signal);
  } finally {
    over.abort(new Error("the site's read is over"));
  }
}

/** readSite's pages, `n` workers at a time. `job` is the caller's own signal: a city page stopped by it stops the read. */
async function readPages(api: Api, n: number, job: AbortSignal): Promise<SiteRead> {
  const regions = (await getJson(api, "getAllDeals", `${SITE_API}/api/bestDeals/getAllDeals`, List)).data.filter(
    (e) => e.type === "region",
  );
  if (regions.length === 0) throw new SiteError("getAllDeals", "the site lists no region");
  const main = (await getJson(api, "getMain", `${SITE_API}/api/bestDeals/getMain`, List)).data;
  const promoted = new Set(main.filter((e) => e.type === "city").map((e) => e.id));

  const regionPages = await inPool(regions, n, async (r) => ({ id: r.id, page: await pageOf(api, r.id) }));
  const countries = regionPages.flatMap(({ id, page }) => {
    if (page.type !== "region") throw new SiteError(`getOne?id=${id}`, "a region's page is not a region");
    return (page.bestDeals ?? []).filter((e) => e.type === "country");
  });
  const countryPages = await inPool(countries, n, async (c) => ({ id: c.id, page: await pageOf(api, c.id) }));
  const listed = new Set<number>();
  countryPages.forEach(({ id, page }) => {
    if (page.type !== "country") throw new SiteError(`getOne?id=${id}`, "a country's page is not a country");
    for (const city of (page.bestDeals ?? []).filter((e) => e.type === "city")) listed.add(city.id);
  });

  const ids = [...listed];
  const pages = await inPool(ids, n, async (id) => {
    try {
      return toSiteCity(id, await pageOf(api, id));
    } catch (err) {
      if (job.aborted || (err instanceof SiteError && err.status === 429)) throw err;
      return null;
    }
  });
  const cities = pages.filter((c): c is SiteCity => c !== null);
  const failed = ids.filter((_, i) => pages[i] === null);
  return { cities, failed, promoted };
}

/**
 * Whether the photo answers, as an image — a HEAD request, nothing downloaded. `no`: the site says it is gone (404,
 * 410) or not an image; `unknown`: anything else — no answer, a 5xx, a 403 from a firewall, a 408, a 429 — and the sync
 * keeps last night's verdict.
 */
export async function imageCheck(deps: SiteDeps, url: string): Promise<"yes" | "no" | "unknown"> {
  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": deps.userAgent },
      signal: AbortSignal.any([deps.signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch {
    if (deps.signal.aborted) throw deps.signal.reason ?? new Error("aborted");
    return "unknown";
  }
  if (res.status === 404 || res.status === 410) return "no";
  if (!res.ok) return "unknown";
  const type = res.headers.get("content-type");
  return type === null || type.toLowerCase().startsWith("image/") ? "yes" : "no";
}
