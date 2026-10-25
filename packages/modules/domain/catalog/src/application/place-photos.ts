/**
 * Place photos (ADR-IMPL-043): for the city each airport serves, a photograph hosted elsewhere, or the point a satellite
 * view is centred on. Four tiers, in order: Wikimedia Commons through Wikidata; Pexels, when the club holds a key; the
 * satellite view (the app draws it from Mapbox); the app's own image while nothing is known. The route answers from the
 * table at once and adds the airports it has never seen; the resolve-place-photos job looks them up, ten a minute.
 */
import { z } from "zod";
import { errorForLog, type Executor } from "@bbc/db";
import { PLACE_PHOTOS_MAX_CODES, PlacePhotoVM } from "@bbc/shared/api/v1/places";

import { airportsRepo } from "../infrastructure/airports.repo";
import type { LandmarkStandIn } from "../infrastructure/place-landmarks.repo";
import { placePhotosRepo, type PlacePhotoRow } from "../infrastructure/place-photos.repo";
import { sourceHoldsRepo } from "../infrastructure/source-holds.repo";
import { landmarkAuthor } from "./landmark-sources";
import {
  CARD_WIDTH,
  HERO_WIDTH,
  REQUEST_TIMEOUT_MS,
  SourceError,
  acceptCommons,
  askCommons,
  askPexels,
  commonsPage,
  commonsThumbAt,
  findCities,
  type CityFacts,
  type Centre,
  type FoundPhoto,
  type ImageInfo,
  type SourceDeps,
  type Stage,
} from "./place-photo-sources";

/** Airports looked up in one run: one Wikidata question, two Commons questions. */
export const PLACE_PHOTOS_BATCH = 10;
/** Cities looked up by their own name in one run — those whose airport Wikidata does not know near ours: one more
 *  Wikidata question each. The rest wait for the next run, their look not counted. */
export const CITY_SEARCHES_PER_RUN = 2;
/** Pexels questions in one run. 60 runs an hour stay under Pexels' 200 an hour. */
export const PEXELS_PER_RUN = 3;
/**
 * A run's requests end within this long of its start: the job is stopped at 50 s (module.ts) and its writes need the
 * rest. A request (eight seconds at most) starts only while it can end inside it; a city that needed one waits for the
 * next run, its look not counted (`deferred`). Before, a run whose every answer was slow went to 56 s, the job's abort
 * cut the Pexels question in flight, and the cities left were counted as failed.
 */
export const PLACE_PHOTOS_REQUESTS_MS = 40_000;

/** `codes=LHR,cdg, LHR` → ["LHR", "CDG"]; null unless 1–20 IATA codes. */
export function parseCodes(raw: string | undefined): string[] | null {
  const codes = [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (codes.length === 0 || codes.length > PLACE_PHOTOS_MAX_CODES) return null;
  return codes.every((c) => /^[A-Z]{3}$/.test(c)) ? codes : null;
}

/** What the app reads. An operator's photo with no author, licence or page has no credit line. */
export function toPlacePhotoVM(row: PlacePhotoRow): PlacePhotoVM {
  const code = row.code.trim();
  if (row.status === "photo" && row.source && row.cardUrl && row.heroUrl) {
    const silent = row.source === "override" && !row.author && !row.license && !row.link;
    return {
      code,
      kind: "photo",
      card: row.cardUrl,
      hero: row.heroUrl,
      credit: silent
        ? null
        : {
            source: row.source === "override" ? "club" : row.source,
            author: row.author,
            license: row.license,
            link: row.link,
          },
    };
  }
  if (row.status === "satellite" && row.lat !== null && row.lng !== null) {
    return { code, kind: "satellite", lat: Number(row.lat), lng: Number(row.lng) };
  }
  return { code, kind: "none" };
}

/**
 * A landmark's photograph as the city's photo (ADR-IMPL-064, amendment 1): its 1280-px thumbnail full width, the same
 * file at 500 px for a card (else the 1280 one), and its own credit — its author, its licence, its Commons page — as a
 * Commons city photo is credited. Null when the result is something the app could not read (the route then leaves
 * the city as it was).
 */
export function landmarkAsPhoto(code: string, landmark: LandmarkStandIn): PlacePhotoVM | null {
  const vm: PlacePhotoVM = {
    code,
    kind: "photo",
    card: commonsThumbAt(landmark.imageUrl, CARD_WIDTH) ?? landmark.imageUrl,
    hero: landmark.imageUrl,
    credit: {
      source: "wikimedia",
      author: landmarkAuthor(landmark.credit),
      license: landmark.licence,
      link: commonsPage(landmark.file),
    },
  };
  return PlacePhotoVM.safeParse(vm).success ? vm : null;
}

/**
 * The answer with a landmark standing in where a city has no photograph of its own — its satellite view, or nothing
 * yet (ADR-IMPL-064, amendment 1). A photo of any source (Commons, Pexels, the club's own) stays first. `standIns` is
 * the first landmark the route may show for each place (`placeLandmarksRepo.standIns`: rank order, the flag's `skip`
 * left out); empty while `catalog.landmarks` is off — then nothing changes.
 */
export function withLandmarkPhotos(
  items: readonly PlacePhotoVM[],
  standIns: ReadonlyMap<string, LandmarkStandIn>,
): PlacePhotoVM[] {
  return items.map((item) => {
    if (item.kind === "photo") return item;
    const landmark = standIns.get(item.code);
    return (landmark && landmarkAsPhoto(item.code, landmark)) ?? item;
  });
}

const HttpsUrl = z.string().trim().max(2048).url().startsWith("https://");

/** PUT /v1/internal/places/:code/photo — an operator's own photo: two https addresses, the credit if the photo needs one. */
export const PlacePhotoOverride = z
  .object({
    card: HttpsUrl,
    hero: HttpsUrl,
    credit: z
      .object({
        author: z.string().trim().min(1).max(120).optional(),
        license: z.string().trim().min(1).max(60).optional(),
        link: HttpsUrl.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type Place = { code: string; city: string; lat: number; lng: number };

export type Outcome =
  | { kind: "photo"; source: "wikimedia" | "pexels"; photo: FoundPhoto; centre: Centre }
  /** `soon`: looked at again in a day — the view stands in while Pexels refuses the club's key. */
  | { kind: "satellite"; centre: Centre; soon?: true }
  | { kind: "retry"; stage: Stage }
  /** Not looked at, not for the city's fault: due again at once, or — when a source answered 429 (`heldBy`) — once its
   *  Retry-After (`afterS`) has passed. */
  | { kind: "deferred"; afterS?: number; heldBy?: "wikidata" | "commons" };

type Log = { warn(o: object, m?: string): void; error(o: object, m?: string): void };

const failure = (err: unknown): { stage: Stage; message: string; status?: number; retryAfterS?: number } => {
  if (err instanceof SourceError) {
    return { stage: err.stage, message: err.message, status: err.status, retryAfterS: err.retryAfterS };
  }
  throw err;
};

/**
 * Decides each place in order: a Commons photo of the city; else, with a key and while the run's three Pexels questions
 * last, a Pexels photo; else the satellite view. The city is found by its airport, else — for two places a run — by its
 * own name near the airport; a place past those two is `deferred`. A source that fails leaves the place to a later run
 * (`retry`) — never a downgrade to the satellite view because a server was down; a search by name that fails is its own
 * city's (`retry`), and the places still waiting for one are `deferred`. A source that answers 429 asked the
 * club to wait: the places that needed it are `deferred` until its Retry-After has passed, the look not counted
 * (ADR-IMPL-064). A place still waiting for Pexels when the run's share is spent is `deferred`: due again at once. A
 * key Pexels refuses (401) counts as none for the run, and a city's photo stays: a city that `holding` says has one
 * keeps it; one that has none gets its satellite view for a day. With a `deadline` (ms, on `now`'s clock), no request
 * starts that could end after it: a city that needed one is `deferred`.
 */
export async function decidePlaces(
  places: readonly Place[],
  deps: {
    sources: SourceDeps;
    pexelsKey: string | undefined;
    logger: Log;
    holding?: ReadonlySet<string>;
    deadline?: number;
    now?: () => number;
  },
): Promise<Map<string, Outcome>> {
  const out = new Map<string, Outcome>();
  const now = deps.now ?? Date.now;
  const canAsk = () => deps.deadline === undefined || now() + REQUEST_TIMEOUT_MS <= deps.deadline;
  // Wikidata is asked about IATA codes only; an airport whose code is something else gets its satellite view.
  const askable = places.filter((p) => /^[A-Z]{3}$/.test(p.code));
  for (const p of places) {
    if (!askable.includes(p)) out.set(p.code, { kind: "satellite", centre: { lat: p.lat, lng: p.lng } });
  }
  if (askable.length === 0) return out;
  if (!canAsk()) {
    for (const p of askable) out.set(p.code, { kind: "deferred" });
    return out;
  }

  let facts: Map<string, CityFacts>;
  try {
    const found = await findCities(deps.sources, askable, CITY_SEARCHES_PER_RUN, canAsk);
    facts = found.facts;
    for (const code of found.later) out.set(code, { kind: "deferred" });
    // A search that failed is its own city's: the others found keep their answer.
    if (found.error) {
      deps.logger.warn({ stage: found.error.stage, err: found.error.message }, "place photos: a source failed");
      for (const code of found.failed) out.set(code, { kind: "retry", stage: "wikidata" });
    }
  } catch (err) {
    const f = failure(err);
    if (f.retryAfterS !== undefined) {
      deps.logger.warn({ stage: f.stage, retryAfterS: f.retryAfterS }, "place photos: a source asked the club to wait");
      for (const p of askable) out.set(p.code, { kind: "deferred", afterS: f.retryAfterS, heldBy: "wikidata" });
      return out;
    }
    deps.logger.warn({ stage: f.stage, err: f.message }, "place photos: a source failed");
    for (const p of askable) out.set(p.code, { kind: "retry", stage: "wikidata" });
    return out;
  }

  const files = [...new Set([...facts.values()].flatMap((f) => f.files))];
  let heroes = new Map<string, ImageInfo>();
  let cards = new Map<string, ImageInfo>();
  let commonsDown = false;
  let commonsWait: number | undefined;
  /** No time left in the run to ask Commons: the cities with files wait for the next run. */
  const commonsLate = files.length > 0 && !canAsk();
  if (files.length > 0 && !commonsLate) {
    try {
      [heroes, cards] = await Promise.all([
        askCommons(deps.sources, files, HERO_WIDTH, true),
        askCommons(deps.sources, files, CARD_WIDTH, false),
      ]);
    } catch (err) {
      const f = failure(err);
      if (f.retryAfterS !== undefined) {
        deps.logger.warn(
          { stage: f.stage, retryAfterS: f.retryAfterS },
          "place photos: a source asked the club to wait",
        );
        commonsWait = f.retryAfterS;
      } else {
        deps.logger.warn({ stage: f.stage, err: f.message }, "place photos: a source failed");
      }
      commonsDown = true;
    }
  }

  let pexelsAsked = 0;
  let pexelsDown = false;
  /** Pexels refused the key (401): for this run the club has none. */
  let pexelsRefused = false;
  const refusedKey = (place: Place, centre: Centre): Outcome =>
    deps.holding?.has(place.code) ? { kind: "retry", stage: "pexels" } : { kind: "satellite", centre, soon: true };
  for (const place of askable) {
    const known = facts.get(place.code);
    if (!known) continue; // past the run's searches, or its search failed: decided above
    const centre = known.centre ?? { lat: place.lat, lng: place.lng };
    if (known.files.length > 0 && commonsLate) {
      out.set(place.code, { kind: "deferred" });
      continue;
    }
    if (known.files.length > 0 && commonsDown) {
      out.set(
        place.code,
        commonsWait === undefined
          ? { kind: "retry", stage: "commons" }
          : { kind: "deferred", afterS: commonsWait, heldBy: "commons" },
      );
      continue;
    }
    const commons = known.files.map((f) => acceptCommons(heroes.get(f), cards.get(f))).find((p) => p !== null);
    if (commons) {
      out.set(place.code, { kind: "photo", source: "wikimedia", photo: commons, centre });
      continue;
    }
    if (!deps.pexelsKey) {
      out.set(place.code, { kind: "satellite", centre });
      continue;
    }
    if (pexelsRefused) {
      out.set(place.code, refusedKey(place, centre));
      continue;
    }
    if (pexelsDown) {
      out.set(place.code, { kind: "retry", stage: "pexels" });
      continue;
    }
    if (pexelsAsked >= PEXELS_PER_RUN || !canAsk()) {
      out.set(place.code, { kind: "deferred" });
      continue;
    }
    pexelsAsked += 1;
    try {
      const pexels = await askPexels(deps.sources, deps.pexelsKey, place.city);
      out.set(
        place.code,
        pexels ? { kind: "photo", source: "pexels", photo: pexels, centre } : { kind: "satellite", centre },
      );
    } catch (err) {
      const f = failure(err);
      if (f.status === 401) {
        // A key Pexels does not accept will not start working by waiting: an operator must replace it. (A 403 may
        // come from the network in front of Pexels: it counts as down, below.)
        deps.logger.error({ stage: f.stage, status: f.status }, "place photos: Pexels refused PEXELS_API_KEY");
        pexelsRefused = true;
        out.set(place.code, refusedKey(place, centre));
        continue;
      }
      deps.logger.warn({ stage: f.stage, err: f.message, status: f.status }, "place photos: a source failed");
      // Down, slow or out of its hourly share: the run asks it nothing more.
      pexelsDown = true;
      out.set(place.code, { kind: "retry", stage: "pexels" });
    }
  }
  return out;
}

/** Claimed codes `decidePlaces` gave no outcome: their airport did not come back — a code the airports query cannot
 *  match (it asks in upper case), or one removed meanwhile (its row goes with it, so the retry finds nothing). Each is
 *  tried again later like a failed source — never claimed again every ten minutes. */
export function withoutOutcome(claimed: readonly { code: string }[], outcomes: ReadonlyMap<string, Outcome>): string[] {
  return [...new Set(claimed.map((c) => c.code.trim()))].filter((code) => !outcomes.has(code));
}

/** The resolve-place-photos job: claim what is due, decide it — its requests ending within `PLACE_PHOTOS_REQUESTS_MS`
 *  of the start (`now`: the clock, a test's own) — and write it. Every number lands in platform.job_runs. */
export async function resolvePlacePhotos(deps: {
  db: Executor;
  sources: SourceDeps;
  pexelsKey: string | undefined;
  metrics: { inc(name: string, labels?: Record<string, string>, by?: number): void };
  logger: Log;
  now?: () => number;
}): Promise<Record<string, number>> {
  const now = deps.now ?? Date.now;
  const deadline = now() + PLACE_PHOTOS_REQUESTS_MS;
  const claimed = await placePhotosRepo.claimDue(deps.db, PLACE_PHOTOS_BATCH);
  if (claimed.length === 0) return { claimed: 0 };
  // Wikimedia asked the club to wait (a 429, this job's or the landmarks' — ADR-IMPL-064): nothing is asked before the
  // hold ends, and the claimed cities wait for it, their look not counted.
  const heldFor = await sourceHoldsRepo.heldFor(deps.db);
  if (heldFor !== null) {
    const codes = [...new Set(claimed.map((c) => c.code.trim()))];
    await placePhotosRepo.writeDeferred(deps.db, codes, heldFor);
    return { claimed: claimed.length, photos: 0, satellites: 0, retries: 0, deferred: codes.length, held: 1 };
  }
  const airports = await airportsRepo.getMany(
    deps.db,
    claimed.map((c) => c.code),
  );
  const places: Place[] = airports.map((a) => ({
    code: a.code.trim(),
    city: a.city,
    lat: Number(a.lat),
    lng: Number(a.lng),
  }));
  const holding = new Set(claimed.filter((c) => c.status === "photo").map((c) => c.code.trim()));
  const outcomes = await decidePlaces(places, { ...deps, holding, deadline, now });

  const counts = { claimed: claimed.length, photos: 0, satellites: 0, retries: 0, deferred: 0 };
  const retry: string[] = [];
  /** The codes deferred, by the seconds they wait (0: due again at once). */
  const deferred = new Map<number, string[]>();
  /** The longest wait each source asked for. */
  const holds = new Map<"wikidata" | "commons", number>();
  for (const code of withoutOutcome(claimed, outcomes)) {
    deps.logger.warn({ code }, "place photos: no airport for a claimed city");
    deps.metrics.inc("place_photos_failed", { stage: "airport" });
    retry.push(code);
  }
  for (const [code, outcome] of outcomes) {
    if (outcome.kind === "retry") {
      retry.push(code);
      deps.metrics.inc("place_photos_failed", { stage: outcome.stage });
      continue;
    }
    if (outcome.kind === "deferred") {
      const afterS = outcome.afterS ?? 0;
      deferred.set(afterS, [...(deferred.get(afterS) ?? []), code]);
      if (outcome.heldBy) holds.set(outcome.heldBy, Math.max(holds.get(outcome.heldBy) ?? 0, afterS));
      continue;
    }
    // One row the database refuses must not hold back the others: it is looked at again later, like a failed source.
    try {
      if (outcome.kind === "photo") {
        await placePhotosRepo.writePhoto(deps.db, code, { source: outcome.source, ...outcome.photo }, outcome.centre);
        counts.photos += 1;
      } else {
        await placePhotosRepo.writeSatellite(deps.db, code, outcome.centre, outcome.soon === true);
        counts.satellites += 1;
      }
      deps.metrics.inc("place_photos_resolved", {
        status: outcome.kind,
        source: outcome.kind === "photo" ? outcome.source : "none",
      });
    } catch (err) {
      // The SQLSTATE and the constraint, never the query's values (AGENTS.md rule 6).
      deps.logger.warn({ code, err: errorForLog(err) }, "place photos: write refused");
      deps.metrics.inc("place_photos_failed", { stage: "write" });
      retry.push(code);
    }
  }
  await placePhotosRepo.writeRetry(deps.db, retry);
  for (const [afterS, codes] of deferred) await placePhotosRepo.writeDeferred(deps.db, codes, afterS);
  for (const [source, afterS] of holds) {
    await sourceHoldsRepo.hold(deps.db, source, afterS);
    deps.metrics.inc("place_photos_held", { stage: source });
  }
  counts.retries = retry.length;
  counts.deferred = [...deferred.values()].reduce((n, codes) => n + codes.length, 0);
  return holds.size > 0 ? { ...counts, held: 1 } : counts;
}
