import type { Executor } from "@bbc/db";
import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { airports, placePhotos } from "@bbc/db/schema/catalog";

export type PlacePhotoRow = Pick<
  typeof placePhotos.$inferSelect,
  "code" | "status" | "source" | "cardUrl" | "heroUrl" | "author" | "license" | "link" | "lat" | "lng"
>;

/** A photo found for a city, as it is stored. */
export type StoredPhoto = {
  source: "wikimedia" | "pexels";
  cardUrl: string;
  heroUrl: string;
  author: string | null;
  license: string | null;
  link: string;
};

/** Where a satellite view, or the city behind a photo, is centred. */
export type Centre = { lat: number; lng: number };

const columns = {
  code: placePhotos.code,
  status: placePhotos.status,
  source: placePhotos.source,
  cardUrl: placePhotos.cardUrl,
  heroUrl: placePhotos.heroUrl,
  author: placePhotos.author,
  license: placePhotos.license,
  link: placePhotos.link,
  lat: placePhotos.lat,
  lng: placePhotos.lng,
};

/** The job never touches an operator's photo: every write it makes carries this condition. */
const notOverride = or(isNull(placePhotos.source), ne(placePhotos.source, "override"));

/** A row the job has looked at answers again in 30 days, spread over three more so that the rows found on one day do
 *  not all fall due together. */
const lookAgain = sql`now() + interval '30 days' + random() * interval '3 days'`;

const coord = (n: number) => n.toFixed(6);

/** ADR-IMPL-043. Addresses and credits only — an image never enters the database. */
export const placePhotosRepo = {
  async getMany(exec: Executor, codes: string[]): Promise<PlacePhotoRow[]> {
    if (codes.length === 0) return [];
    return exec.select(columns).from(placePhotos).where(inArray(placePhotos.code, codes));
  },

  /**
   * Rows, due at once, for the codes that are airports and had none when the request read; returns every one of those
   * codes that is an airport. Two members asking at the same moment add one row, and both are answered: the request
   * that finds the row already added updates nothing (`attempts` set to itself) but gets it back.
   */
  async addPending(exec: Executor, codes: string[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const rows = await exec
      .insert(placePhotos)
      .select((qb) => qb.select({ code: airports.code }).from(airports).where(inArray(airports.code, codes)))
      .onConflictDoUpdate({ target: placePhotos.code, set: { attempts: sql`${placePhotos.attempts}` } })
      .returning({ code: placePhotos.code });
    return rows.map((r) => r.code.trim());
  },

  /**
   * Takes up to `limit` due rows — new ones first, then the longest due — and holds them for ten minutes: a run that
   * dies leaves them to a later one. Never an operator's photo. Counts the look in `attempts`.
   */
  async claimDue(
    exec: Executor,
    limit: number,
  ): Promise<{ code: string; attempts: number; status: "pending" | "photo" | "satellite" }[]> {
    const due = exec
      .select({ code: placePhotos.code })
      .from(placePhotos)
      .where(and(lte(placePhotos.expiresAt, sql`now()`), notOverride))
      .orderBy(desc(sql`${placePhotos.status} = 'pending'`), asc(placePhotos.expiresAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    return exec
      .update(placePhotos)
      .set({ expiresAt: sql`now() + interval '10 minutes'`, attempts: sql`${placePhotos.attempts} + 1` })
      .where(inArray(placePhotos.code, due))
      .returning({ code: placePhotos.code, attempts: placePhotos.attempts, status: placePhotos.status });
  },

  async writePhoto(exec: Executor, code: string, photo: StoredPhoto, centre: Centre): Promise<void> {
    await exec
      .update(placePhotos)
      .set({
        status: "photo",
        ...photo,
        lat: coord(centre.lat),
        lng: coord(centre.lng),
        attempts: 0,
        resolvedAt: sql`now()`,
        expiresAt: lookAgain,
      })
      .where(and(eq(placePhotos.code, code), notOverride));
  },

  /** `soon`: looked at again in a day, not a month — the view stands in while Pexels refuses the club's key. */
  async writeSatellite(exec: Executor, code: string, centre: Centre, soon = false): Promise<void> {
    await exec
      .update(placePhotos)
      .set({
        status: "satellite",
        source: null,
        cardUrl: null,
        heroUrl: null,
        author: null,
        license: null,
        link: null,
        lat: coord(centre.lat),
        lng: coord(centre.lng),
        attempts: 0,
        resolvedAt: sql`now()`,
        expiresAt: soon ? sql`now() + interval '1 day'` : lookAgain,
      })
      .where(and(eq(placePhotos.code, code), notOverride));
  },

  /** A source failed: what the row holds stays, and the job looks again in as many hours as it has tried (a day at
   *  most). */
  async writeRetry(exec: Executor, codes: string[]): Promise<void> {
    if (codes.length === 0) return;
    await exec
      .update(placePhotos)
      .set({ expiresAt: sql`now() + least(${placePhotos.attempts}, 24) * interval '1 hour'` })
      .where(and(inArray(placePhotos.code, codes), notOverride));
  },

  /** Not looked at this run (Pexels' share of the run was spent): due again at once, and the look not counted. */
  async writeDeferred(exec: Executor, codes: string[]): Promise<void> {
    if (codes.length === 0) return;
    await exec
      .update(placePhotos)
      .set({ expiresAt: sql`now()`, attempts: sql`greatest(${placePhotos.attempts} - 1, 0)` })
      .where(and(inArray(placePhotos.code, codes), notOverride));
  },

  /** An operator's own photo for a city: it replaces what the job found, and the job never looks at it again. */
  async setOverride(
    exec: Executor,
    code: string,
    photo: { cardUrl: string; heroUrl: string; author: string | null; license: string | null; link: string | null },
  ): Promise<PlacePhotoRow> {
    const values = {
      status: "photo" as const,
      source: "override" as const,
      ...photo,
      attempts: 0,
      resolvedAt: sql`now()`,
      expiresAt: sql`'infinity'::timestamptz`,
    };
    const [row] = await exec
      .insert(placePhotos)
      .values({ code, ...values })
      .onConflictDoUpdate({ target: placePhotos.code, set: values })
      .returning(columns);
    if (!row) throw new Error(`place photo ${code}: the upsert returned no row`);
    return row;
  },

  /** Back to the job: the row is new again and due at once. False when the city had no operator's photo. */
  async clearOverride(exec: Executor, code: string): Promise<boolean> {
    const rows = await exec
      .update(placePhotos)
      .set({
        status: "pending",
        source: null,
        cardUrl: null,
        heroUrl: null,
        author: null,
        license: null,
        link: null,
        attempts: 0,
        resolvedAt: null,
        expiresAt: sql`now()`,
      })
      .where(and(eq(placePhotos.code, code), eq(placePhotos.source, "override")))
      .returning({ code: placePhotos.code });
    return rows.length > 0;
  },
};
