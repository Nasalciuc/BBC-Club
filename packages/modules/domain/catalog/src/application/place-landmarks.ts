/**
 * Landmarks (ADR-IMPL-064): for the city each airport serves, up to three of its sights with a photograph hosted on
 * Wikimedia Commons and its credit. The route answers from the table at once; the resolve-place-landmarks job looks
 * places up a few at a time — those the app has shown a city photo for and the site's cities — and again a month later.
 */
import { errorForLog, withTx, type Executor } from "@bbc/db";
import { PLACE_LANDMARKS_MAX, type PlaceLandmarksVM } from "@bbc/shared/api/v1/places";

import { airportsRepo } from "../infrastructure/airports.repo";
import { placeLandmarksRepo, type PlaceLandmarkRow } from "../infrastructure/place-landmarks.repo";
import { sourceHoldsRepo } from "../infrastructure/source-holds.repo";
import {
  LANDMARK_QUESTION_TIMEOUT_MS,
  askLandmarkFiles,
  askLandmarks,
  landmarkFiles,
  pickLandmarks,
  readLandmarks,
} from "./landmark-sources";
import { REQUEST_TIMEOUT_MS, SourceError, findCities, type ImageInfo, type SourceDeps } from "./place-photo-sources";

/**
 * Places looked up in one run. Each: one Wikidata question for its sights (a second when the city item it remembers
 * answers nothing, after the city is found again) and Commons once per 50 files, a hundred at most (two questions).
 * Finding a city asks the airports' question (one for the run's places) and, for a city found by its name, a search.
 */
export const LANDMARK_PLACES_PER_RUN = 2;
/** A run's requests end within this long of its start: the job is stopped at 240 s (module.ts), its writes need the
 *  rest. */
export const LANDMARK_RUN_REQUESTS_MS = 225_000;
/**
 * The longest one place's look can take, every answer as slow as its timeout allows: its landmarks' question twice (a
 * remembered city item that answers nothing, then the one found again), the city found again (the airports' question
 * and a search), and Commons twice (`LANDMARK_FILES_MAX`) — 162 s. A place starts only while that much is left; the
 * cities found first take at most 24 s, so a run's first place always does.
 */
export const LANDMARK_PLACE_MAX_MS = 2 * LANDMARK_QUESTION_TIMEOUT_MS + 4 * REQUEST_TIMEOUT_MS;

const QID = /^Q[1-9]\d*$/;
const IATA = /^[A-Z]{3}$/;

/** The flag row `catalog.landmarks` (seeded off): `skip` lists the landmarks an operator keeps out, by Wikidata item. */
export function readLandmarksFlag(value: Record<string, unknown> | null): {
  enabled: boolean;
  skip: ReadonlySet<string>;
} {
  const skip = Array.isArray(value?.skip) ? value.skip : [];
  return {
    enabled: value?.enabled === true,
    skip: new Set(skip.filter((x): x is string => typeof x === "string" && QID.test(x))),
  };
}

/** What the app reads: the landmarks best first, without those an operator keeps out — at once, before the job has
 *  looked again. */
export function toPlaceLandmarksVM(
  code: string,
  rows: readonly PlaceLandmarkRow[],
  skip: ReadonlySet<string>,
): PlaceLandmarksVM {
  return {
    code,
    landmarks: rows
      .filter((r) => !skip.has(r.landmarkQid))
      .slice(0, PLACE_LANDMARKS_MAX)
      .map((r) => ({
        name: r.name,
        imageUrl: r.imageUrl,
        width: r.width,
        height: r.height,
        credit: { text: r.credit, licence: r.licence, ...(r.licenceUrl ? { licenceUrl: r.licenceUrl } : {}) },
      })),
  };
}

type Log = { warn(o: object, m?: string): void; error(o: object, m?: string): void };

/**
 * The resolve-place-landmarks job. Nothing while a Wikimedia source holds the club off (a 429's Retry-After, this job's
 * or the place photos'). Else up to two due places: the city behind each (the one its last look found, else Wikidata's
 * — by its airport, else by its own name, as the city photo finds it), one question to WDQS for its sights (a second
 * for a remembered city found again, below), Commons once per 50 of their photographs (a hundred at most, two
 * questions), and the rows written (a place without a city found gets a `fewer` marker: looked,
 * none). A remembered city item that answers nothing at all (merged into another since) is found again, never taken
 * for a city without sights. A 429 holds that source for its Retry-After and stops the run, the places untouched; another failure keeps what
 * the places have, tries them again in six hours, and stops the run — a search by a city's name that fails is its own
 * place's, the others left untouched. A place starts only while its slowest look still ends inside the run's 225 s;
 * else it waits for the next run, untouched (`later`). Run twice, it writes the same rows. Every number lands in
 * platform.job_runs.
 */
export async function resolvePlaceLandmarks(deps: {
  db: Executor;
  sources: SourceDeps;
  skip: ReadonlySet<string>;
  metrics: { inc(name: string, labels?: Record<string, string>, by?: number): void };
  logger: Log;
  /** The clock (a test's own). */
  now?: () => number;
}): Promise<Record<string, number>> {
  const now = deps.now ?? Date.now;
  const deadline = now() + LANDMARK_RUN_REQUESTS_MS;
  const counts = { places: 0, landmarks: 0, fewer: 0, failed: 0, held: 0 };
  if ((await sourceHoldsRepo.heldFor(deps.db)) !== null) return { ...counts, held: 1 };
  const due = await placeLandmarksRepo.due(deps.db, LANDMARK_PLACES_PER_RUN);
  if (due.length === 0) return counts;

  /** A source failed for `codes`: the run stops here. */
  const stop = async (err: unknown, codes: string[]): Promise<Record<string, number>> => {
    if (!(err instanceof SourceError)) throw err;
    if (err.retryAfterS !== undefined && (err.stage === "wikidata" || err.stage === "commons")) {
      await sourceHoldsRepo.hold(deps.db, err.stage, err.retryAfterS);
      deps.logger.warn(
        { stage: err.stage, retryAfterS: err.retryAfterS },
        "landmarks: a source asked the club to wait",
      );
      deps.metrics.inc("place_landmarks_held", { stage: err.stage });
      return { ...counts, held: 1 };
    }
    deps.logger.warn({ stage: err.stage, err: err.message, status: err.status }, "landmarks: a source failed");
    deps.metrics.inc("place_landmarks_failed", { stage: err.stage });
    await placeLandmarksRepo.writeFailed(deps.db, codes);
    return { ...counts, failed: counts.failed + codes.length };
  };

  /**
   * The city item behind each of `codes`, as the city photo finds it (by airport, else by name); a code that is not
   * IATA's (Wikidata is asked about those only) or whose airport did not come back has none. A search by name that
   * failed is in `error`, its place in `failed`; the places it left unsearched have no entry. Throws SourceError when
   * the airports' question fails, and on a 429.
   */
  const citiesOf = async (
    codes: string[],
  ): Promise<{ cities: Map<string, string | null>; failed: string[]; error?: SourceError }> => {
    const airports = await airportsRepo.getMany(deps.db, codes);
    const places = airports
      .map((a) => ({ code: a.code.trim(), city: a.city, lat: Number(a.lat), lng: Number(a.lng) }))
      .filter((p) => IATA.test(p.code));
    if (places.length === 0) return { cities: new Map(), failed: [] };
    const found = await findCities(deps.sources, places, places.length);
    const cities = new Map<string, string | null>();
    for (const p of places) {
      const facts = found.facts.get(p.code);
      if (facts) cities.set(p.code, facts.qid);
    }
    return { cities, failed: found.failed, ...(found.error ? { error: found.error } : {}) };
  };

  const remembered = new Map<string, string>();
  for (const d of due) if (d.cityQid !== null) remembered.set(d.code, d.cityQid);
  const cities = new Map<string, string | null>(remembered);
  const unknown = due.filter((d) => d.cityQid === null).map((d) => d.code);
  if (unknown.length > 0) {
    let found: Awaited<ReturnType<typeof citiesOf>>;
    try {
      found = await citiesOf(unknown);
    } catch (err) {
      return stop(err, unknown);
    }
    // A search that failed is its own place's: the run stops, the other places untouched for the next one.
    if (found.error) return stop(found.error, found.failed);
    for (const [code, qid] of found.cities) cities.set(code, qid);
  }

  for (const [i, place] of due.entries()) {
    // Too little of the run left for this place's slowest look: it and those after it wait for the next run, untouched
    // (`later`) — never cut off by the job's timeout half-way.
    if (now() + LANDMARK_PLACE_MAX_MS > deadline) return { ...counts, later: due.length - i };
    // No city (Wikidata knows none near the airport, or the airport did not come back): looked, nothing to find.
    let cityQid = cities.get(place.code) ?? null;
    let found: ReturnType<typeof pickLandmarks> = [];
    if (cityQid !== null) {
      let read: ReturnType<typeof readLandmarks>;
      try {
        let answer = await askLandmarks(deps.sources, cityQid);
        // The item a place's rows remember answered nothing at all, not even its own photographs: merged into another
        // or emptied since. The city is found again rather than the place written down to nothing.
        if (answer.length === 0 && remembered.has(place.code)) {
          const found = await citiesOf([place.code]);
          if (found.error) throw found.error;
          const again = found.cities.get(place.code) ?? null;
          if (again !== cityQid) {
            cityQid = again;
            answer = again === null ? [] : await askLandmarks(deps.sources, again);
          }
        }
        read = readLandmarks(answer, cityQid ?? "", deps.skip);
      } catch (err) {
        return stop(err, [place.code]);
      }
      const files = landmarkFiles(read);
      let infos = new Map<string, ImageInfo>();
      if (files.length > 0) {
        try {
          infos = await askLandmarkFiles(deps.sources, files);
        } catch (err) {
          return stop(err, [place.code]);
        }
      }
      found = pickLandmarks(read, infos);
    }
    // One place the database refuses must not hold back the others: it is looked at again later, like a failed source.
    try {
      await withTx(deps.db, (tx) => placeLandmarksRepo.write(tx, place.code, cityQid, found));
    } catch (err) {
      // The SQLSTATE and the constraint, never the query's values (AGENTS.md rule 6).
      deps.logger.warn({ code: place.code, err: errorForLog(err) }, "landmarks: write refused");
      deps.metrics.inc("place_landmarks_failed", { stage: "write" });
      await placeLandmarksRepo.writeFailed(deps.db, [place.code]);
      counts.failed += 1;
      continue;
    }
    counts.places += 1;
    counts.landmarks += found.length;
    if (found.length < 3) counts.fewer += 1;
    deps.metrics.inc("place_landmarks_resolved", { found: String(found.length) });
  }
  return counts;
}
