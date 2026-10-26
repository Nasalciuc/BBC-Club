import type { Executor } from "@bbc/db";
import { and, asc, count, eq, gt, inArray, min, notInArray, sql } from "drizzle-orm";
import { placeLandmarks, placePhotos, sitePlaces } from "@bbc/db/schema/catalog";

/** A landmark as the route reads it. */
export type PlaceLandmarkRow = {
  rank: number;
  landmarkQid: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  licence: string;
  licenceUrl: string | null;
  credit: string;
};

/** A landmark whose photograph may stand in for its city's (ADR-IMPL-064, amendment 1). */
export type LandmarkStandIn = { file: string; imageUrl: string; licence: string; credit: string };

/** A landmark found, as it is stored. */
export type StoredLandmark = {
  qid: string;
  name: string;
  file: string;
  imageUrl: string;
  width: number;
  height: number;
  licence: string;
  licenceUrl: string | null;
  credit: string;
};

/** A place is looked at again in 30 days, spread over three more so that the places found on one day do not all fall
 *  due together (as place photos). */
const lookAgain = sql`now() + interval '30 days' + random() * interval '3 days'`;
/** A look that failed (a source down, a question timed out) is tried again in six hours. */
const afterFailure = sql`now() + interval '6 hours'`;

/** ADR-IMPL-064. Addresses and credits only — an image never enters the database. */
export const placeLandmarksRepo = {
  /**
   * Up to `limit` places due a look: the airports with a city photo row (the app has shown their city) or the site's
   * cities' main airports, that have no landmark row yet (first) or whose rows have expired (the longest due first).
   * Each with the city item its last look found, if any.
   */
  async due(exec: Executor, limit: number): Promise<{ code: string; cityQid: string | null }[]> {
    const places = exec
      .select({ code: placePhotos.code })
      .from(placePhotos)
      .union(exec.select({ code: sitePlaces.airport }).from(sitePlaces))
      .as("places");
    const looked = count(placeLandmarks.code);
    const dueAt = min(placeLandmarks.expiresAt);
    const rows = await exec
      .select({ code: places.code, cityQid: min(placeLandmarks.cityQid) })
      .from(places)
      .leftJoin(placeLandmarks, eq(placeLandmarks.code, places.code))
      .groupBy(places.code)
      .having(sql`${looked} = 0 OR ${dueAt} <= now()`)
      .orderBy(sql`${looked} > 0`, dueAt, places.code)
      .limit(limit);
    return rows.map((r) => ({ code: r.code.trim(), cityQid: r.cityQid }));
  },

  /** The landmarks shown for a place, best first. */
  async forPlace(exec: Executor, code: string): Promise<PlaceLandmarkRow[]> {
    const rows = await exec
      .select({
        rank: placeLandmarks.rank,
        landmarkQid: placeLandmarks.landmarkQid,
        name: placeLandmarks.name,
        imageUrl: placeLandmarks.imageUrl,
        width: placeLandmarks.width,
        height: placeLandmarks.height,
        licence: placeLandmarks.licence,
        licenceUrl: placeLandmarks.licenceUrl,
        credit: placeLandmarks.credit,
      })
      .from(placeLandmarks)
      .where(and(eq(placeLandmarks.code, code), eq(placeLandmarks.kind, "landmark")))
      .orderBy(asc(placeLandmarks.rank));
    // The CHECK place_landmarks_landmark keeps every one of these set on a landmark row.
    return rows.flatMap((r) =>
      r.landmarkQid && r.name && r.imageUrl && r.width && r.height && r.licence && r.credit
        ? [
            {
              ...r,
              landmarkQid: r.landmarkQid,
              name: r.name,
              imageUrl: r.imageUrl,
              width: r.width,
              height: r.height,
              licence: r.licence,
              credit: r.credit,
            },
          ]
        : [],
    );
  },

  /**
   * For each of `codes`, the first landmark the landmarks route would show — the lowest rank among those the operator
   * does not keep out (`skip`, Wikidata items) — whose photograph stands in for a city without one of its own. One
   * query however many codes; a place without such a landmark is absent.
   */
  async standIns(
    exec: Executor,
    codes: readonly string[],
    skip: ReadonlySet<string>,
  ): Promise<Map<string, LandmarkStandIn>> {
    if (codes.length === 0) return new Map();
    const rows = await exec
      .selectDistinctOn([placeLandmarks.code], {
        code: placeLandmarks.code,
        file: placeLandmarks.file,
        imageUrl: placeLandmarks.imageUrl,
        licence: placeLandmarks.licence,
        credit: placeLandmarks.credit,
      })
      .from(placeLandmarks)
      .where(
        and(
          inArray(placeLandmarks.code, [...codes]),
          eq(placeLandmarks.kind, "landmark"),
          skip.size > 0 ? notInArray(placeLandmarks.landmarkQid, [...skip]) : undefined,
        ),
      )
      .orderBy(placeLandmarks.code, asc(placeLandmarks.rank));
    // The CHECK place_landmarks_landmark keeps every one of these set on a landmark row.
    return new Map(
      rows.flatMap((r) =>
        r.file && r.imageUrl && r.licence && r.credit
          ? [[r.code.trim(), { file: r.file, imageUrl: r.imageUrl, licence: r.licence, credit: r.credit }] as const]
          : [],
      ),
    );
  },

  /**
   * What a look found, replacing what the place had: the landmarks at ranks 1 to 3, best first, and — when fewer than
   * three — a `fewer` marker right after the last one (rank 1 when there is none, `cityQid` null when no city was
   * found). Ranks past those go. Twice the same look writes the same rows (each upserted by its rank, `created_at`
   * kept). Run it in a transaction: the old marker leaves before the new one comes (one marker a place).
   */
  async write(exec: Executor, code: string, cityQid: string | null, found: readonly StoredLandmark[]): Promise<void> {
    const landmarks = cityQid === null ? [] : found.slice(0, 3);
    const marker = landmarks.length < 3;
    const ranks = landmarks.length + (marker ? 1 : 0);
    await exec.delete(placeLandmarks).where(and(eq(placeLandmarks.code, code), gt(placeLandmarks.rank, ranks)));
    const none = {
      landmarkQid: null,
      name: null,
      file: null,
      imageUrl: null,
      width: null,
      height: null,
      licence: null,
      licenceUrl: null,
      credit: null,
    };
    const rows = [
      ...landmarks.map((l, i) => ({
        rank: i + 1,
        kind: "landmark" as const,
        cityQid,
        landmarkQid: l.qid,
        name: l.name,
        file: l.file,
        imageUrl: l.imageUrl,
        width: l.width,
        height: l.height,
        licence: l.licence,
        licenceUrl: l.licenceUrl,
        credit: l.credit,
      })),
      ...(marker ? [{ rank: landmarks.length + 1, kind: "fewer" as const, cityQid, ...none }] : []),
    ];
    // In rank order: a marker that moves up is replaced by a landmark before the new marker is written.
    for (const { rank, ...row } of rows) {
      const set = { ...row, fetchedAt: sql`now()`, expiresAt: lookAgain };
      await exec
        .insert(placeLandmarks)
        .values({ code, rank, ...set })
        .onConflictDoUpdate({ target: [placeLandmarks.code, placeLandmarks.rank], set });
    }
  },

  /**
   * A look that failed: what the places hold stays — never a downgrade because a server was down — and is looked at
   * again in six hours; a place with nothing yet gets a `failed` marker that waits as long.
   */
  async writeFailed(exec: Executor, codes: string[]): Promise<void> {
    if (codes.length === 0) return;
    await exec.update(placeLandmarks).set({ expiresAt: afterFailure }).where(inArray(placeLandmarks.code, codes));
    await exec
      .insert(placeLandmarks)
      .values(codes.map((code) => ({ code, rank: 1, kind: "failed" as const, expiresAt: afterFailure })))
      .onConflictDoNothing();
  },
};
