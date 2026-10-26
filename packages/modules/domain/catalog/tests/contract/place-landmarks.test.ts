/**
 * Landmarks against the database (ADR-IMPL-064): the job (which places, twice the same rows, a 429, a failure, fewer
 * than three), the route (shape, ETag, 404, the flag, the operator's skip) and the CHECKs. Wikidata and Commons answer
 * from the saved answers of 25 Oct 2026 (tests/unit/wikimedia, made-up authors).
 */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "@bbc/platform";
import type { Principal } from "@bbc/shared/authz/principal";
import { PlaceLandmarksVM, PlacePhotosVM, type PlacePhotoVM } from "@bbc/shared/api/v1/places";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { DEFAULT_RETRY_AFTER_S, type Binding, type Fetch } from "../../src/application/place-photo-sources";
import {
  LANDMARK_PLACE_MAX_MS,
  LANDMARK_RUN_REQUESTS_MS,
  resolvePlaceLandmarks,
} from "../../src/application/place-landmarks";
import { placeLandmarksRepo } from "../../src/infrastructure/place-landmarks.repo";
import { placePhotosRepo } from "../../src/infrastructure/place-photos.repo";
import { sourceHoldsRepo } from "../../src/infrastructure/source-holds.repo";
import { catalogModule } from "../../src/module";
import { binding, fakeSources } from "../unit/place-photos.fixture";
import parisAnswer from "../unit/wikimedia/landmarks-paris.json";
import chisinauAnswer from "../unit/wikimedia/landmarks-chisinau.json";
import rmoKiv from "../unit/wikimedia/wdqs-city-rmo-kiv.json";

const MEMBER: Principal = {
  kind: "member",
  role: "member",
  memberId: "00000000-0000-4000-8000-000000000001",
  sessionId: "s",
  email: "m@test.dev",
};

type Saved = { wdqs: { results: { bindings: unknown[] } }; commons: Record<string, unknown> };
const rowsOf = (a: { results: { bindings: unknown[] } }) => a.results.bindings as Binding[];
const paris = parisAnswer as Saved;
const chisinau = chisinauAnswer as Saved;

/** Charles de Gaulle names Paris (Q90); RMO is WDQS's own answer (Chișinău, Q21197). */
const cdgFields = {
  iata: "CDG",
  airport: "Q46400",
  airportCoord: [2.55, 49.009722] as [number, number],
  cityLabel: "Paris",
};
const cdg = binding({ ...cdgFields, city: "Q90" });
const answers = {
  wikidata: [cdg, ...rowsOf(rmoKiv)],
  landmarks: { Q90: rowsOf(paris.wdqs), Q21197: rowsOf(chisinau.wdqs) },
  commonsInfo: { ...paris.commons, ...chisinau.commons },
};

async function setup(
  name: string,
  sources: Parameters<typeof fakeSources>[0],
  on?: Awaited<ReturnType<typeof isolatedDb>>,
) {
  const iso = on ?? (await isolatedDb(name));
  const fake = fakeSources(sources);
  const platform = createPlatform(iso.db, { level: "silent" });
  const out = await catalogModule({ fetch: fake.fetch }).init({
    db: iso.db,
    platform,
    env: { APP_ORIGIN: "https://api.example.test" } as never,
    ports: {},
  });
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("principal", MEMBER);
    c.set("requestId", name);
    c.set("clientIp", null);
    await next();
  });
  const mounted = out.routes?.[0];
  if (!mounted) throw new Error("catalog routes missing");
  app.route(mounted.basePath, mounted.app);
  const job = out.jobs?.find((j) => j.name === "resolve-place-landmarks");
  if (!job) throw new Error("resolve-place-landmarks missing");
  return {
    iso,
    fake,
    run: () => job.spec.handler({ signal: new AbortController().signal }) as Promise<Record<string, number>>,
    get: (code: string, headers: Record<string, string> = {}) =>
      app.request(`/v1/places/${code}/landmarks`, { headers }),
    landmarks: async (code: string) => {
      const res = await app.request(`/v1/places/${code}/landmarks`);
      expect(res.status).toBe(200);
      return PlaceLandmarksVM.parse(await res.json());
    },
    /** GET /v1/places/photos — the city photos, a landmark standing in where a city has none (amendment 1). */
    photos: async (codes: string) => {
      const res = await app.request(`/v1/places/photos?codes=${codes}`);
      expect(res.status).toBe(200);
      return PlacePhotosVM.parse(await res.json()).items;
    },
    /** The flag row, through this platform: its 30-s cache is dropped at once. */
    flag: (value: { enabled: boolean; skip: string[] }) => platform.flags.set("catalog.landmarks", value),
    rows: async (code: string) =>
      (await iso.db.execute(sql`
        SELECT rank, kind, city_qid, landmark_qid, name, file, image_url, width, height, licence, licence_url, credit,
               created_at, round(extract(epoch FROM expires_at - now()) / 3600)::int AS hours
        FROM catalog.place_landmarks WHERE code = ${code} ORDER BY rank`)) as unknown as {
        rank: number;
        kind: string;
        city_qid: string | null;
        landmark_qid: string | null;
        name: string | null;
        file: string | null;
        image_url: string | null;
        licence: string | null;
        credit: string | null;
        created_at: Date;
        hours: number;
      }[],
    due: () =>
      iso.db.execute(sql`
        UPDATE catalog.place_landmarks SET fetched_at = now() - interval '1 hour', expires_at = now() - interval '1 minute'`),
  };
}

/** A city photo row: the app has shown the city, so the job looks at its landmarks. */
const shown = (iso: Awaited<ReturnType<typeof isolatedDb>>, ...codes: string[]) =>
  Promise.all(codes.map((code) => iso.db.execute(sql`INSERT INTO catalog.place_photos (code) VALUES (${code})`)));

describe("landmarks", () => {
  it("the job finds three landmarks for each city shown, the route serves them, and twice is the same rows", async () => {
    const t = await setup("landmarks-flow", answers);
    await t.flag({ enabled: true, skip: [] });
    expect(await t.run()).toEqual({ places: 0, landmarks: 0, fewer: 0, failed: 0, held: 0 }); // nothing shown yet
    expect(t.fake.calls).toHaveLength(0);

    await shown(t.iso, "CDG", "RMO");
    expect(await t.run()).toEqual({ places: 2, landmarks: 6, fewer: 0, failed: 0, held: 0 });
    // One question for both cities, then one to WDQS and one to Commons per city.
    expect(t.fake.calls.map((c) => new URL(c.url).hostname)).toEqual([
      "query.wikidata.org",
      "query.wikidata.org",
      "commons.wikimedia.org",
      "query.wikidata.org",
      "commons.wikimedia.org",
    ]);
    for (const c of t.fake.calls)
      expect(c.headers["user-agent"]).toBe("BBCClub/1.0 (https://api.example.test; landmarks)");

    const cdgVm = await t.landmarks("cdg");
    expect(cdgVm.code).toBe("CDG");
    expect(cdgVm.landmarks.map((l) => l.name)).toEqual(["Eiffel Tower", "Musée d'Orsay", "Palace of Versailles"]);
    expect(cdgVm.landmarks[0]).toMatchObject({ width: 1280, height: 853, credit: { licence: "CC BY-SA 4.0" } });
    expect((await t.landmarks("RMO")).landmarks.map((l) => l.name)).toEqual([
      "National Museum of Fine Arts",
      "National Museum of History of Moldova",
      "Water Tower of Chișinău",
    ]);
    expect((await t.rows("CDG")).map((r) => [r.rank, r.kind, r.city_qid, r.landmark_qid])).toEqual([
      [1, "landmark", "Q90", "Q243"],
      [2, "landmark", "Q90", "Q23402"],
      [3, "landmark", "Q90", "Q2946"],
    ]);
    const first = await t.rows("CDG");
    expect(first[0]?.hours).toBeGreaterThanOrEqual(30 * 24);
    expect(first[0]?.hours).toBeLessThanOrEqual(33 * 24);

    // Nothing due: no question outside.
    const asked = t.fake.calls.length;
    expect(await t.run()).toEqual({ places: 0, landmarks: 0, fewer: 0, failed: 0, held: 0 });
    expect(t.fake.calls).toHaveLength(asked);

    // Due again: the same rows (created_at kept), and the city item is not asked again — the rows know it.
    await t.due();
    expect(await t.run()).toEqual({ places: 2, landmarks: 6, fewer: 0, failed: 0, held: 0 });
    const strip = (rows: Awaited<ReturnType<typeof t.rows>>) => rows.map(({ hours: _h, ...r }) => r);
    expect(strip(await t.rows("CDG"))).toEqual(strip(first));
    expect(t.fake.calls.slice(asked).map((c) => new URL(c.url).hostname)).toEqual([
      "query.wikidata.org",
      "commons.wikimedia.org",
      "query.wikidata.org",
      "commons.wikimedia.org",
    ]);
    await t.iso.drop();
  });

  it("answers with an ETag, 304 when unchanged; 404 for a code that is no airport; nothing while the flag is off", async () => {
    const t = await setup("landmarks-route", answers);
    await shown(t.iso, "CDG");
    // Off (the seeded state): the route serves none and the job asks nothing.
    expect((await t.landmarks("CDG")).landmarks).toEqual([]);
    expect(await t.run()).toEqual({ skipped: 1 });
    expect(t.fake.calls).toHaveLength(0);

    await t.flag({ enabled: true, skip: [] });
    const empty = await t.get("CDG");
    expect(await empty.json()).toEqual({ code: "CDG", landmarks: [] }); // not looked at yet
    await t.run();
    const res = await t.get("CDG");
    expect(res.status).toBe(200);
    const etag = res.headers.get("ETag");
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect(etag).not.toBe(empty.headers.get("ETag"));
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    const again = await t.get("CDG", { "If-None-Match": etag ?? "" });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect((await t.get("CDG", { "If-None-Match": `W/${etag}` })).status).toBe(304);
    expect((await t.get("CDG", { "If-None-Match": '"0000000000000000"' })).status).toBe(200);

    // The operator keeps the Eiffel Tower out: gone at once (a new ETag), before the job looks again.
    await t.flag({ enabled: true, skip: ["Q243"] });
    const skipped = await t.get("CDG", { "If-None-Match": etag ?? "" });
    expect(skipped.status).toBe(200);
    expect(PlaceLandmarksVM.parse(await skipped.json()).landmarks.map((l) => l.name)).toEqual([
      "Musée d'Orsay",
      "Palace of Versailles",
    ]);
    // …and the next look picks another in its place.
    await t.due();
    await t.run();
    expect((await t.landmarks("CDG")).landmarks.map((l) => l.name)).toEqual([
      "Musée d'Orsay",
      "Palace of Versailles",
      "Arc de Triomphe",
    ]);

    expect((await t.get("QQQ")).status).toBe(404);
    expect((await t.get("CD1")).status).toBe(404);
    expect((await t.get("CDGX")).status).toBe(404);
    await t.iso.drop();
  });

  it("a 429 holds the source for its Retry-After and stops the run; no Wikimedia job asks before then", async () => {
    const t = await setup("landmarks-429", { ...answers, landmarks: { Q90: 429 }, retryAfter: "1000" });
    await t.flag({ enabled: true, skip: [] });
    await shown(t.iso, "CDG", "RMO");
    expect(await t.run()).toEqual({ places: 0, landmarks: 0, fewer: 0, failed: 0, held: 1 });
    expect(await t.rows("CDG")).toEqual([]); // untouched: not the place's fault
    expect(await t.rows("RMO")).toEqual([]); // the run stopped before it
    const holds = (await t.iso.db.execute(sql`
      SELECT source, round(extract(epoch FROM not_before - now()))::int AS seconds FROM catalog.source_holds`)) as unknown as {
      source: string;
      seconds: number;
    }[];
    expect(holds).toHaveLength(1);
    expect(holds[0]?.source).toBe("wikidata");
    expect(Math.abs((holds[0]?.seconds ?? 0) - 1000)).toBeLessThanOrEqual(5);

    const asked = t.fake.calls.length;
    expect(await t.run()).toEqual({ places: 0, landmarks: 0, fewer: 0, failed: 0, held: 1 });
    expect(t.fake.calls).toHaveLength(asked);

    // The place photos' job honours the same hold: it asks nothing and its cities wait for it.
    await t.iso.db.execute(sql`UPDATE catalog.place_photos SET expires_at = now() - interval '1 minute'`);
    const job = (
      await catalogModule({ fetch: t.fake.fetch }).init({
        db: t.iso.db,
        platform: createPlatform(t.iso.db, { level: "silent" }),
        env: { APP_ORIGIN: "https://api.example.test" } as never,
        ports: {},
      })
    ).jobs?.find((j) => j.name === "resolve-place-photos");
    expect(await job?.spec.handler({ signal: new AbortController().signal })).toEqual({
      claimed: 2,
      photos: 0,
      satellites: 0,
      retries: 0,
      deferred: 2,
      held: 1,
    });
    expect(t.fake.calls).toHaveLength(asked);

    // Commons' 429 holds Commons the same way.
    const c = await setup("", { ...answers, commonsInfo: undefined, commons: 429, retryAfter: "40" }, t.iso);
    await t.iso.db.execute(sql`DELETE FROM catalog.source_holds`);
    expect(await c.run()).toEqual({ places: 0, landmarks: 0, fewer: 0, failed: 0, held: 1 });
    const commons = (await t.iso.db.execute(sql`SELECT source FROM catalog.source_holds`)) as unknown as {
      source: string;
    }[];
    expect(commons.map((h) => h.source)).toEqual(["commons"]);
    await t.iso.drop();
  });

  it("a second 429 never shortens a hold already longer; a longer one lengthens it", async () => {
    const iso = await isolatedDb("landmarks-hold-longer");
    const left = async () =>
      (
        (await iso.db.execute(sql`
          SELECT source, round(extract(epoch FROM not_before - now()))::int AS seconds
          FROM catalog.source_holds ORDER BY source::text`)) as unknown as { source: string; seconds: number }[]
      ).map((h) => [h.source, h.seconds] as const);
    const about = (seconds: number | undefined, expected: number) =>
      expect(Math.abs((seconds ?? 0) - expected)).toBeLessThanOrEqual(5);

    // The landmarks' job is held off WDQS for 1000 s; the place photos' job, already running beside it, then gets a 429
    // it cannot read the wait of (its default): the 1000 s stay, whichever job writes last.
    await sourceHoldsRepo.hold(iso.db, "wikidata", 1000);
    await sourceHoldsRepo.hold(iso.db, "wikidata", DEFAULT_RETRY_AFTER_S);
    let holds = await left();
    expect(holds.map(([source]) => source)).toEqual(["wikidata"]);
    about(holds[0]?.[1], 1000);

    // The other way round: a longer wait lengthens the hold.
    await sourceHoldsRepo.hold(iso.db, "commons", 40);
    await sourceHoldsRepo.hold(iso.db, "commons", 1000);
    holds = await left();
    expect(holds.map(([source]) => source)).toEqual(["commons", "wikidata"]);
    about(holds[0]?.[1], 1000);
    about((await sourceHoldsRepo.heldFor(iso.db)) ?? 0, 1000);
    await iso.drop();
  });

  it("a failed look keeps what a place has and tries again in six hours; a new place gets a failed marker", async () => {
    const t = await setup("landmarks-failed", answers);
    await t.flag({ enabled: true, skip: [] });
    await shown(t.iso, "CDG");
    await t.run();
    const before = await t.rows("CDG");

    const down = await setup("", { ...answers, landmarks: { Q90: 504, Q21197: 500 } }, t.iso);
    await shown(t.iso, "RMO");
    await t.due();
    // RMO is new and comes first: its question fails, the run stops there, CDG's turn comes later.
    expect(await down.run()).toEqual({ places: 0, landmarks: 0, fewer: 0, failed: 1, held: 0 });
    expect((await t.rows("RMO")).map((r) => [r.rank, r.kind, r.city_qid, r.hours])).toEqual([[1, "failed", null, 6]]);
    expect((await t.landmarks("RMO")).landmarks).toEqual([]);
    expect(await down.run()).toEqual({ places: 0, landmarks: 0, fewer: 0, failed: 1, held: 0 });
    const kept = await t.rows("CDG");
    expect(kept.map((r) => [r.kind, r.landmark_qid, r.hours])).toEqual(before.map((r) => [r.kind, r.landmark_qid, 6]));
    expect((await t.landmarks("CDG")).landmarks).toHaveLength(3); // never a downgrade
    await t.iso.drop();
  });

  it("fewer than three: what exists and a marker, so the job does not ask again for a month; no city: a marker alone", async () => {
    // Paris with Commons knowing only the Arc de Triomphe's photograph.
    const arc = "Arc de Triomphe - Août 2026.jpg";
    const t = await setup("landmarks-fewer", { ...answers, commonsInfo: { [arc]: paris.commons[arc] } });
    await t.flag({ enabled: true, skip: [] });
    // Nowhere: an airport Wikidata knows nothing about, by code or by name.
    await t.iso.db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng)
      VALUES ('ZZY', 'Nowhere Field', 'Nowhere', 'Nowhere', 'NW', 'europe', 1, 2)`);
    await shown(t.iso, "CDG", "ZZY");
    expect(await t.run()).toEqual({ places: 2, landmarks: 1, fewer: 2, failed: 0, held: 0 });
    expect((await t.rows("CDG")).map((r) => [r.rank, r.kind, r.name, r.hours >= 30 * 24])).toEqual([
      [1, "landmark", "Arc de Triomphe", true],
      [2, "fewer", null, true],
    ]);
    expect((await t.rows("ZZY")).map((r) => [r.rank, r.kind, r.city_qid])).toEqual([[1, "fewer", null]]);
    expect((await t.landmarks("CDG")).landmarks.map((l) => l.name)).toEqual(["Arc de Triomphe"]);

    // Commons knows more next month: the marker moves after the last one found.
    const more = await setup("", answers, t.iso);
    await t.due();
    await more.run();
    expect((await t.rows("CDG")).map((r) => [r.rank, r.kind])).toEqual([
      [1, "landmark"],
      [2, "landmark"],
      [3, "landmark"],
    ]);
    await t.iso.drop();
  });

  it("a place that drops to fewer landmarks loses the ranks past them: the route never serves a stale one", async () => {
    const t = await setup("landmarks-drop", answers);
    await t.flag({ enabled: true, skip: [] });
    await shown(t.iso, "CDG");
    await t.run();
    expect((await t.rows("CDG")).map((r) => [r.rank, r.kind])).toEqual([
      [1, "landmark"],
      [2, "landmark"],
      [3, "landmark"],
    ]);

    // Next month Commons accepts only the Arc de Triomphe's photograph: one landmark, the marker after it, rank 3 gone.
    const arc = "Arc de Triomphe - Août 2026.jpg";
    const one = await setup("", { ...answers, commonsInfo: { [arc]: paris.commons[arc] } }, t.iso);
    await t.due();
    expect(await one.run()).toEqual({ places: 1, landmarks: 1, fewer: 1, failed: 0, held: 0 });
    expect((await t.rows("CDG")).map((r) => [r.rank, r.kind, r.name])).toEqual([
      [1, "landmark", "Arc de Triomphe"],
      [2, "fewer", null],
    ]);
    expect((await t.landmarks("CDG")).landmarks.map((l) => l.name)).toEqual(["Arc de Triomphe"]);

    // Then none: the marker alone, at rank 1.
    const none = await setup("", { ...answers, commonsInfo: {} }, t.iso);
    await t.due();
    expect(await none.run()).toEqual({ places: 1, landmarks: 0, fewer: 1, failed: 0, held: 0 });
    expect((await t.rows("CDG")).map((r) => [r.rank, r.kind])).toEqual([[1, "fewer"]]);
    expect((await t.landmarks("CDG")).landmarks).toEqual([]);
    await t.iso.drop();
  });

  it("a remembered city item that answers nothing (merged since) is found again, not taken for a city without sights", async () => {
    const t = await setup("landmarks-merged", answers);
    await t.flag({ enabled: true, skip: [] });
    await shown(t.iso, "CDG");
    await t.run();
    // Wikidata merged Paris into another item: the old one answers no row at all; the airport now names the new one.
    const merged = binding({ ...cdgFields, city: "Q7777777" });
    const after = await setup(
      "",
      { ...answers, wikidata: [merged], landmarks: { Q90: [], Q7777777: rowsOf(paris.wdqs) } },
      t.iso,
    );
    await t.due();
    expect(await after.run()).toEqual({ places: 1, landmarks: 3, fewer: 0, failed: 0, held: 0 });
    expect((await t.rows("CDG")).map((r) => [r.kind, r.city_qid])).toEqual([
      ["landmark", "Q7777777"],
      ["landmark", "Q7777777"],
      ["landmark", "Q7777777"],
    ]);
    await t.iso.drop();
  });

  it("a city whose name holds a tab is searched by its words: neither job stops on it", async () => {
    const t = await setup("landmarks-tab", { ...answers, cities: [] });
    await t.flag({ enabled: true, skip: [] });
    // A made-up airport Wikidata does not know; the airports' import keeps a tab inside a city's name.
    await t.iso.db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng)
      VALUES ('AAQ', 'Saint Field', ${"Saint\tTown"}, 'Nowhere', 'NW', 'europe', 1, 2)`);
    await shown(t.iso, "AAQ", "CDG");
    expect(await t.run()).toEqual({ places: 2, landmarks: 3, fewer: 1, failed: 0, held: 0 });
    expect((await t.rows("AAQ")).map((r) => [r.rank, r.kind, r.city_qid])).toEqual([[1, "fewer", null]]);
    expect((await t.landmarks("CDG")).landmarks).toHaveLength(3);
    const search = t.fake.calls.find((c) => (c.body ?? "").includes("EntitySearch"));
    expect(new URLSearchParams(search?.body ?? "").get("query")).toContain('("AAQ" "Saint Town")');

    // The city photos' job decides both cities too (neither has a photo on Wikidata: satellite views).
    const photos = (
      await catalogModule({ fetch: t.fake.fetch }).init({
        db: t.iso.db,
        platform: createPlatform(t.iso.db, { level: "silent" }),
        env: { APP_ORIGIN: "https://api.example.test" } as never,
        ports: {},
      })
    ).jobs?.find((j) => j.name === "resolve-place-photos");
    expect(await photos?.spec.handler({ signal: new AbortController().signal })).toEqual({
      claimed: 2,
      photos: 0,
      satellites: 2,
      retries: 0,
      deferred: 0,
    });
    await t.iso.drop();
  });

  it("a search by name that fails is its own place's: a failed marker, the other place untouched for the next run", async () => {
    const t = await setup("landmarks-search-failed", { ...answers, cityStatus: { ZZY: 500 } });
    await t.flag({ enabled: true, skip: [] });
    // Nowhere: an airport Wikidata does not know by its code (a made-up one); its search answers 500.
    await t.iso.db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng)
      VALUES ('ZZY', 'Nowhere Field', 'Nowhere', 'Nowhere', 'NW', 'europe', 1, 2)`);
    await shown(t.iso, "CDG", "ZZY");
    expect(await t.run()).toEqual({ places: 0, landmarks: 0, fewer: 0, failed: 1, held: 0 });
    expect((await t.rows("ZZY")).map((r) => [r.rank, r.kind, r.hours])).toEqual([[1, "failed", 6]]);
    expect(await t.rows("CDG")).toEqual([]); // found by its airport: its look not spent
    expect(await t.run()).toEqual({ places: 1, landmarks: 3, fewer: 0, failed: 0, held: 0 });
    expect((await t.rows("CDG")).map((r) => r.kind)).toEqual(["landmark", "landmark", "landmark"]);
    await t.iso.drop();
  });

  it("a place starts only while its slowest look can end inside the run: the next one waits, untouched", async () => {
    const t = await setup("landmarks-budget", answers);
    await shown(t.iso, "CDG", "RMO");
    // Each landmarks question takes seventy seconds (made up; WDQS stops one at 60 s, the job waits 65): after Paris's,
    // Chișinău's slowest look (162 s) would end past the run's 225 s.
    expect(LANDMARK_PLACE_MAX_MS).toBe(162_000);
    const clock = { now: 0 };
    const fetch: Fetch = async (url, init) => {
      const query = new URLSearchParams(typeof init?.body === "string" ? init.body : "").get("query") ?? "";
      if (query.includes("wikibase:around")) clock.now += 70_000;
      return t.fake.fetch(url, init);
    };
    const platform = createPlatform(t.iso.db, { level: "silent" });
    const run = () =>
      resolvePlaceLandmarks({
        db: t.iso.db,
        sources: { fetch, userAgent: "BBCClub/1.0 (test)", signal: new AbortController().signal },
        skip: new Set(),
        metrics: platform.metrics,
        logger: platform.logger,
        now: () => clock.now,
      });
    expect(await run()).toEqual({ places: 1, landmarks: 3, fewer: 0, failed: 0, held: 0, later: 1 });
    expect(clock.now + LANDMARK_PLACE_MAX_MS).toBeGreaterThan(LANDMARK_RUN_REQUESTS_MS);
    expect((await t.rows("CDG")).map((r) => r.kind)).toEqual(["landmark", "landmark", "landmark"]);
    expect(await t.rows("RMO")).toEqual([]); // untouched: first in the next run
    expect(await run()).toEqual({ places: 1, landmarks: 3, fewer: 0, failed: 0, held: 0 });
    expect((await t.rows("RMO")).map((r) => r.kind)).toEqual(["landmark", "landmark", "landmark"]);
    await t.iso.drop();
  });

  it("the site's cities are looked at too", async () => {
    const t = await setup("landmarks-site", answers);
    await t.flag({ enabled: true, skip: [] });
    await t.iso.db.execute(sql`
      INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports)
      VALUES (7, 'Paris', 'France', 'Europe', 'CDG', '{CDG}')`);
    expect(await t.run()).toMatchObject({ places: 1, landmarks: 3 });
    await t.iso.drop();
  });

  it("a city on its satellite view shows its first landmark's photograph, credited as that photograph (amendment 1)", async () => {
    const t = await setup("landmarks-stand-in", answers);
    // Paris's city photo is its satellite view (nothing the photo job may show); Chișinău's is not looked up yet.
    await t.iso.db.execute(sql`
      INSERT INTO catalog.place_photos (code, status, lat, lng, expires_at)
      VALUES ('CDG', 'satellite', 48.856944, 2.351389, now() + interval '30 days')`);
    await shown(t.iso, "RMO");
    const satellite = { code: "CDG", kind: "satellite", lat: 48.856944, lng: 2.351389 } as const;

    // The flag off (as seeded): nothing changes, and no landmark is read.
    expect(await t.photos("CDG,RMO")).toEqual([satellite, { code: "RMO", kind: "none" }]);

    await t.flag({ enabled: true, skip: [] });
    expect(await t.photos("CDG,RMO")).toEqual([satellite, { code: "RMO", kind: "none" }]); // none found yet
    expect(await t.run()).toMatchObject({ places: 2, landmarks: 6 });
    const cdg = await t.rows("CDG");
    const rmo = await t.rows("RMO");
    /** What the app receives for a landmark row: its 1280-px thumbnail, the same at 500 px, its own credit and page. */
    const asPhoto = (code: string, r: (typeof cdg)[number]): PlacePhotoVM => ({
      code,
      kind: "photo",
      card: String(r.image_url).replace("/1280px-", "/500px-"),
      hero: String(r.image_url),
      credit: {
        source: "wikimedia",
        author: String(r.credit).replace(/ · Wikimedia Commons$/, ""),
        license: r.licence,
        link: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(r.file).replace(/ /g, "_"))}`,
      },
    });
    expect(cdg[0]?.landmark_qid).toBe("Q243"); // the Eiffel Tower
    expect(cdg[0]?.image_url).toContain("/1280px-");
    expect(rmo.map((r) => r.kind)).toEqual(["landmark", "landmark", "landmark"]);
    const photos = await t.photos("CDG,RMO,LHR");
    // RMO is not looked up yet: `none` though it has landmarks — phones ask again within a minute, and would keep a
    // stand-in for twelve hours past the city's own photo. LHR has no landmark: nothing yet, as before.
    expect(photos).toEqual([asPhoto("CDG", cdg[0]!), { code: "RMO", kind: "none" }, { code: "LHR", kind: "none" }]);
    expect(photos[0]).toMatchObject({ credit: { license: "CC BY-SA 4.0" } });
    // Composed by the route, never written: the city photo rows are as they were, for the photo job to look again.
    expect(
      await t.iso.db.execute(sql`
        SELECT code, status, source FROM catalog.place_photos WHERE code IN ('CDG', 'RMO') ORDER BY code`),
    ).toEqual([
      { code: "CDG", status: "satellite", source: null },
      { code: "RMO", status: "pending", source: null },
    ] as never);

    // The operator keeps the Eiffel Tower out: the next landmark at once; all three out: the satellite view again.
    await t.flag({ enabled: true, skip: ["Q243"] });
    expect((await t.photos("CDG"))[0]).toEqual(asPhoto("CDG", cdg[1]!)); // Musée d'Orsay
    await t.flag({ enabled: true, skip: ["Q243", "Q23402", "Q2946"] });
    expect(await t.photos("CDG")).toEqual([satellite]);

    // A photo of the city's own stays first: one the photo job found, or the operator's.
    await t.flag({ enabled: true, skip: [] });
    await placePhotosRepo.writePhoto(
      t.iso.db,
      "RMO",
      {
        source: "wikimedia",
        cardUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/C.jpg/500px-C.jpg",
        heroUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/C.jpg/1280px-C.jpg",
        author: "Ion Pop",
        license: "CC BY-SA 4.0",
        link: "https://commons.wikimedia.org/wiki/File:C.jpg",
      },
      { lat: 47.0105, lng: 28.8638 },
    );
    await placePhotosRepo.setOverride(t.iso.db, "CDG", {
      cardUrl: "https://cdn.example.test/paris-card.jpg",
      heroUrl: "https://cdn.example.test/paris.jpg",
      author: null,
      license: null,
      link: null,
    });
    expect(await t.photos("CDG,RMO")).toEqual([
      {
        code: "CDG",
        kind: "photo",
        card: "https://cdn.example.test/paris-card.jpg",
        hero: "https://cdn.example.test/paris.jpg",
        credit: null,
      },
      {
        code: "RMO",
        kind: "photo",
        card: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/C.jpg/500px-C.jpg",
        hero: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/C.jpg/1280px-C.jpg",
        credit: {
          source: "wikimedia",
          author: "Ion Pop",
          license: "CC BY-SA 4.0",
          link: "https://commons.wikimedia.org/wiki/File:C.jpg",
        },
      },
    ]);
    await t.iso.drop();
  });

  it("the database keeps the rows honest", async () => {
    const iso = await isolatedDb("landmarks-checks");
    const landmark = (rank: number, extra = sql``) => sql`
      INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, landmark_qid, name, file, image_url, width, height,
        licence, credit, expires_at)
      VALUES ('CDG', ${rank}, 'landmark', 'Q90', 'Q243', 'Eiffel Tower', 'T.jpg', 'https://u.test/t.jpg', 1280, 853,
        'CC0', 'Wikimedia Commons', now() + interval '1 day') ${extra}`;
    const bad = [
      landmark(0),
      landmark(4),
      sql`INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, expires_at)
          VALUES ('CDG', 1, 'landmark', 'Q90', now() + interval '1 day')`,
      sql`INSERT INTO catalog.place_landmarks (code, rank, kind, name, expires_at)
          VALUES ('CDG', 1, 'fewer', 'A name', now() + interval '1 day')`,
      sql`INSERT INTO catalog.place_landmarks (code, rank, kind, expires_at) VALUES ('CDG', 2, 'failed', now() + interval '1 day')`,
      sql`INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, expires_at)
          VALUES ('CDG', 1, 'fewer', 'Paris', now() + interval '1 day')`,
      sql`INSERT INTO catalog.place_landmarks (code, rank, kind, expires_at) VALUES ('CDG', 1, 'fewer', now() - interval '1 day')`,
      sql`INSERT INTO catalog.place_landmarks (code, rank, kind, expires_at) VALUES ('QQQ', 1, 'fewer', now() + interval '1 day')`,
      sql`INSERT INTO catalog.source_holds (source, not_before) VALUES ('pexels', now())`,
    ];
    const refused = async (statement: ReturnType<typeof sql>) => {
      try {
        await iso.db.execute(statement);
        return false;
      } catch {
        return true;
      }
    };
    for (const statement of bad) expect(await refused(statement)).toBe(true);
    // A landmark's size above zero, its addresses on https.
    expect(
      await refused(sql`
        INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, landmark_qid, name, file, image_url, width,
          height, licence, credit, expires_at)
        VALUES ('CDG', 1, 'landmark', 'Q90', 'Q243', 'Eiffel Tower', 'T.jpg', 'https://u.test/t.jpg', 0, 853, 'CC0',
          'Wikimedia Commons', now() + interval '1 day')`),
    ).toBe(true);
    expect(
      await refused(sql`
        INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, landmark_qid, name, file, image_url, width,
          height, licence, credit, expires_at)
        VALUES ('CDG', 1, 'landmark', 'Q90', 'Q243', 'Eiffel Tower', 'T.jpg', 'http://u.test/t.jpg', 1280, 853, 'CC0',
          'Wikimedia Commons', now() + interval '1 day')`),
    ).toBe(true);

    // Rank unique per place; one marker a place.
    await iso.db.execute(landmark(1));
    expect(await refused(landmark(1))).toBe(true);
    await iso.db.execute(
      sql`INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, expires_at) VALUES ('CDG', 2, 'fewer', 'Q90', now() + interval '1 day')`,
    );
    expect(
      await refused(
        sql`INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, expires_at) VALUES ('CDG', 3, 'fewer', 'Q90', now() + interval '1 day')`,
      ),
    ).toBe(true);

    // The repository's write twice: the same rows.
    const found = [
      {
        qid: "Q243",
        name: "Eiffel Tower",
        file: "T.jpg",
        imageUrl: "https://u.test/t.jpg",
        width: 1280,
        height: 853,
        licence: "CC0",
        licenceUrl: null,
        credit: "Wikimedia Commons",
      },
    ];
    const snapshot = async () =>
      (await iso.db.execute(sql`
        SELECT rank, kind, landmark_qid, created_at FROM catalog.place_landmarks WHERE code = 'CDG' ORDER BY rank`)) as unknown[];
    await iso.db.transaction((tx) => placeLandmarksRepo.write(tx, "CDG", "Q90", found));
    const once = await snapshot();
    await iso.db.transaction((tx) => placeLandmarksRepo.write(tx, "CDG", "Q90", found));
    expect(await snapshot()).toEqual(once);
    expect(once).toHaveLength(2);

    // An airport removed takes its landmarks with it.
    await iso.db.execute(sql`DELETE FROM catalog.airports WHERE code = 'CDG'`);
    const left = (await iso.db.execute(sql`SELECT count(*)::int AS n FROM catalog.place_landmarks`)) as unknown as {
      n: number;
    }[];
    expect(left[0]?.n).toBe(0);
    await iso.drop();
  });
});
