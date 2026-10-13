/**
 * The company's site (ADR-IMPL-045), read through its own API — weba.buybusinessclass.com, the backend the site and its
 * new version both read. Seven regions; each region's countries; each country's cities; a city's page carries its photo,
 * the US cities the site lists a price from, and where it sits (region › country › city). Read-only, once a night, at
 * most four requests at a time, with the club's User-Agent. The site has no IATA codes: site-places.ts finds the
 * airports.
 */
import { z } from "zod";

import type { Fetch } from "./place-photo-sources";

export const SITE_API = "https://weba.buybusinessclass.com";
/** Where the site serves its images: a city's photo is `${SITE_STORAGE}bestDeals/<id>/image/<file>`. */
export const SITE_STORAGE = `${SITE_API}/storage/`;

export type SiteDeps = {
  fetch: Fetch;
  userAgent: string;
  signal: AbortSignal;
  /** Requests in flight at once: four by default — the night's ~240 pages and ~150 photos take well under a minute. */
  concurrency?: number;
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

async function getJson<T extends z.ZodTypeAny>(
  deps: SiteDeps,
  page: string,
  url: string,
  shape: T,
): Promise<z.infer<T>> {
  let res: Response;
  try {
    res = await deps.fetch(url, {
      headers: { "User-Agent": deps.userAgent, Accept: "application/json" },
      signal: AbortSignal.any([deps.signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch (err) {
    throw new SiteError(page, err instanceof Error ? err.message : String(err));
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

const pageOf = (deps: SiteDeps, id: number): Promise<Page> =>
  getJson(deps, `getOne?id=${id}`, `${SITE_API}/api/bestDeals/getOne?id=${id}`, Page).then((r) => r.data);

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
 * Regions → countries → cities, as the site lists them, then each city's own page. A region or a country that does not
 * answer stops the read (which cities are gone could not be told from which are missing); a city that does not answer is
 * listed in `failed`, and the sync keeps what it had for it.
 */
export async function readSite(deps: SiteDeps): Promise<SiteRead> {
  const n = deps.concurrency ?? CONCURRENCY;
  const regions = (await getJson(deps, "getAllDeals", `${SITE_API}/api/bestDeals/getAllDeals`, List)).data.filter(
    (e) => e.type === "region",
  );
  if (regions.length === 0) throw new SiteError("getAllDeals", "the site lists no region");
  const main = (await getJson(deps, "getMain", `${SITE_API}/api/bestDeals/getMain`, List)).data;
  const promoted = new Set(main.filter((e) => e.type === "city").map((e) => e.id));

  const regionPages = await inPool(regions, n, async (r) => ({ id: r.id, page: await pageOf(deps, r.id) }));
  const countries = regionPages.flatMap(({ id, page }) => {
    if (page.type !== "region") throw new SiteError(`getOne?id=${id}`, "a region's page is not a region");
    return (page.bestDeals ?? []).filter((e) => e.type === "country");
  });
  const countryPages = await inPool(countries, n, async (c) => ({ id: c.id, page: await pageOf(deps, c.id) }));
  const listed = new Set<number>();
  countryPages.forEach(({ id, page }) => {
    if (page.type !== "country") throw new SiteError(`getOne?id=${id}`, "a country's page is not a country");
    for (const city of (page.bestDeals ?? []).filter((e) => e.type === "city")) listed.add(city.id);
  });

  const ids = [...listed];
  const pages = await inPool(ids, n, async (id) => {
    try {
      return toSiteCity(id, await pageOf(deps, id));
    } catch (err) {
      if (deps.signal.aborted) throw err;
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
