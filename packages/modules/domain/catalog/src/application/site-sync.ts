/**
 * The nightly sync of the site's destinations (ADR-IMPL-045). Reads the site (site-cms.ts), finds each city's airports
 * (site-places.ts), checks each city's own photo answers, then — in one transaction — replaces the snapshot and puts
 * the site's photos on those airports, or takes them back. All or nothing: a site that does not answer, answers with
 * far fewer cities than last night, or whose cities no longer find their airports, changes nothing — except the
 * photos' own switch, which works on any night: off, or a city skipped, takes effect before the site is asked. "Last
 * night" is a snapshot still within its day (ADR-IMPL-067): one at its end holds back no read, so a site that keeps
 * listing fewer cities is taken a day after its last good read rather than never.
 */
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";

import { placePhotosRepo } from "../infrastructure/place-photos.repo";
import { siteRepo } from "../infrastructure/site.repo";
import {
  SITE_STORAGE,
  SITE_STORAGE_PREFIXES,
  SiteError,
  imageCheck,
  inPool,
  readSite,
  type SiteDeps,
} from "./site-cms";
import { planSite } from "./site-places";

/** A night that finds, or places, fewer than this share of last night's cities changes nothing — while last night's
 *  snapshot is within its day (siteRepo.guarding). */
export const SITE_SHRINK_FLOOR = 0.8;
/** Cities whose own page may fail before the night is given up (each kept as it was): this share, at least three. */
export const SITE_FAILED_CEILING = 0.1;

type Log = { warn(o: object, m?: string): void };

export type SiteSyncOptions = {
  /** Ask the site tonight: its photos or its pins are on. Off, nothing is asked. */
  read: boolean;
  /** The site's photos are on; the cities in `skip` (the site's ids) stay on Wikimedia. Null: off. */
  photos: { skip: ReadonlySet<number> } | null;
};

/** The job's report, recorded in platform.job_runs. */
export type SiteSyncReport = {
  read: number;
  cities: number;
  failed: number;
  places: number;
  routes: number;
  unmapped: number;
  borrowed: number;
  ties: number;
  imagesMissing: number;
  imagesUnknown: number;
  photosSet: number;
  photosCleared: number;
};

const EMPTY: SiteSyncReport = {
  read: 0,
  cities: 0,
  failed: 0,
  places: 0,
  routes: 0,
  unmapped: 0,
  borrowed: 0,
  ties: 0,
  imagesMissing: 0,
  imagesUnknown: 0,
  photosSet: 0,
  photosCleared: 0,
};

export async function syncSite(
  deps: { db: Executor; site: SiteDeps; logger: Log },
  opts: SiteSyncOptions,
): Promise<SiteSyncReport> {
  // The photos' switch first, from what is stored: it must work on a night the site does not answer.
  let cleared = 0;
  if (!opts.photos) {
    cleared = (await placePhotosRepo.clearSitePhotos(deps.db, SITE_STORAGE_PREFIXES)).length;
  } else if (opts.photos.skip.size > 0) {
    // A skipped city's own photos, by their address: an airport it shares keeps another city's.
    cleared = (await placePhotosRepo.clearSitePhotos(deps.db, SITE_STORAGE_PREFIXES, { of: [...opts.photos.skip] }))
      .length;
  }
  if (!opts.read) return { ...EMPTY, photosCleared: cleared };

  const read = await readSite(deps.site);
  const listed = read.cities.length + read.failed.length;
  const before = await siteRepo.guarding(deps.db);
  if (before > 0 && listed < before * SITE_SHRINK_FLOOR) {
    throw new SiteError("night", `the site lists ${listed} cities, the last night ${before}: nothing changed`);
  }
  const ceiling = Math.max(3, Math.ceil(listed * SITE_FAILED_CEILING));
  if (read.failed.length > ceiling) {
    throw new SiteError("night", `${read.failed.length} cities did not answer (at most ${ceiling}): nothing changed`);
  }

  const plan = planSite(read, await siteRepo.mappingAirports(deps.db));
  const kept = await siteRepo.stored(deps.db, read.failed);
  const placed = plan.places.length + kept.size;
  if (before > 0 && placed < before * SITE_SHRINK_FLOOR) {
    throw new SiteError("night", `${placed} cities found their airports, the last night ${before}: nothing changed`);
  }

  // A photo the site says is gone stays off (the city keeps Wikimedia's); one that could not be asked keeps last
  // night's verdict.
  const checks = await inPool(plan.places, deps.site.concurrency ?? 4, (p) =>
    p.image ? imageCheck(deps.site, SITE_STORAGE + p.image) : Promise.resolve("yes" as const),
  );
  const lastNight = await siteRepo.stored(
    deps.db,
    plan.places.filter((_, i) => checks[i] === "unknown").map((p) => p.cmsId),
  );
  const missing = plan.places.filter((p, i) => p.image !== null && checks[i] === "no");
  const unknown = plan.places.filter((_, i) => checks[i] === "unknown");
  const places = plan.places.map((p, i) => {
    if (checks[i] === "no") return { ...p, image: null };
    if (checks[i] === "unknown") return { ...p, image: lastNight.get(p.cmsId)?.image ?? null };
    return p;
  });

  const name = (c: { name: string; id: number }) => `${c.name} (${c.id})`;
  if (plan.unmapped.length > 0) {
    deps.logger.warn({ cities: plan.unmapped.map((c) => `${c.name} (${c.country}, ${c.id})`) }, "site: no airport");
  }
  if (plan.ties.length > 0) {
    deps.logger.warn(
      { cities: plan.ties.map((c) => `${name(c)}: ${c.airports.join(" ")}`) },
      "site: main airport by a tie — list the city in SITE_CITY_AIRPORTS",
    );
  }
  if (plan.borrowed.length > 0) {
    deps.logger.warn({ cities: plan.borrowed.map((c) => `${name(c)}: ${c.image}`) }, "site: borrowed photo");
  }
  if (plan.odd.length > 0)
    deps.logger.warn({ cities: plan.odd.map((c) => `${name(c)}: ${c.image}`) }, "site: odd photo");
  if (missing.length > 0) {
    deps.logger.warn({ cities: missing.map((p) => `${p.name} (${p.cmsId})`) }, "site: photo does not answer");
  }
  if (unknown.length > 0) {
    deps.logger.warn({ cities: unknown.map((p) => `${p.name} (${p.cmsId})`) }, "site: photo not checked, kept");
  }
  if (plan.unknownOrigins.length > 0) deps.logger.warn({ names: plan.unknownOrigins }, "site: unknown US city");
  if (read.failed.length > 0) deps.logger.warn({ ids: read.failed }, "site: city page did not answer, kept");

  const written = await withTx(deps.db, async (tx) => {
    await siteRepo.replace(tx, { places, routes: plan.routes }, read.failed);
    if (!opts.photos) {
      return { set: 0, cleared: (await placePhotosRepo.clearSitePhotos(tx, SITE_STORAGE_PREFIXES)).length };
    }
    // One photo per airport: the first city, by the site's id, that names it — at the site's address today; a row
    // stored under its former address is the site's too, and moves to today's (ADR-IMPL-062).
    const wanted = new Map<string, string>();
    for (const city of await siteRepo.withImage(tx)) {
      if (opts.photos.skip.has(city.cmsId)) continue;
      for (const code of city.airports) if (!wanted.has(code)) wanted.set(code, SITE_STORAGE + city.image);
    }
    let set = 0;
    for (const [code, url] of wanted) {
      if (await placePhotosRepo.setSitePhoto(tx, code, url, SITE_STORAGE_PREFIXES)) set += 1;
    }
    const gone = await placePhotosRepo.clearSitePhotos(tx, SITE_STORAGE_PREFIXES, { keep: [...wanted.keys()] });
    return { set, cleared: gone.length };
  });

  return {
    read: 1,
    cities: read.cities.length,
    failed: read.failed.length,
    places: places.length,
    routes: plan.routes.length,
    unmapped: plan.unmapped.length,
    borrowed: plan.borrowed.length,
    ties: plan.ties.length,
    imagesMissing: missing.length,
    imagesUnknown: unknown.length,
    photosSet: written.set,
    photosCleared: cleared + written.cleared,
  };
}
