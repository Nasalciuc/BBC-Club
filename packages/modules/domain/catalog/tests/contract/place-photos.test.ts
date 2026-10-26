/** Place photos against the database (ADR-IMPL-043): the route, the job, an operator's photo, failures, the flag. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "@bbc/platform";
import type { Principal } from "@bbc/shared/authz/principal";
import { PlacePhotosVM } from "@bbc/shared/api/v1/places";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { placePhotosRepo } from "../../src/infrastructure/place-photos.repo";
import { catalogModule } from "../../src/module";
import { binding, commonsThumb, fakeSources } from "../unit/place-photos.fixture";

const MEMBER: Principal = {
  kind: "member",
  role: "member",
  memberId: "00000000-0000-4000-8000-000000000001",
  sessionId: "s",
  email: "m@test.dev",
};
const SYSTEM: Principal = { kind: "system", role: "system", source: "internal-secret" };

const london = binding({
  iata: "LHR",
  airport: "Q8691",
  airportCoord: [-0.461389, 51.4775],
  city: "Q84",
  cityLabel: "London",
  cityCoord: [-0.1275, 51.507222],
  night: "London at night.jpg",
});
const paris = binding({
  iata: "CDG",
  airport: "Q46400",
  airportCoord: [2.55, 49.009722],
  city: "Q90",
  cityLabel: "Paris",
  cityCoord: [2.351388888, 48.856944444],
  image: "Paris Montage.jpg",
});

/** The module on a fresh database (or `on` one already used), the sources answering from fixtures. */
async function setup(
  name: string,
  answers: Parameters<typeof fakeSources>[0],
  on?: Awaited<ReturnType<typeof isolatedDb>>,
  env: Record<string, string> = {},
) {
  const iso = on ?? (await isolatedDb(name));
  const sources = fakeSources(answers);
  const platform = createPlatform(iso.db, { level: "silent" });
  const out = await catalogModule({ fetch: sources.fetch }).init({
    db: iso.db,
    platform,
    env: { APP_ORIGIN: "https://api.example.test", ...env } as never,
    ports: {},
  });
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("principal", c.req.path.startsWith("/v1/internal/") ? SYSTEM : MEMBER);
    c.set("requestId", name);
    c.set("clientIp", null);
    await next();
  });
  const mounted = out.routes?.[0];
  if (!mounted) throw new Error("catalog routes missing");
  app.route(mounted.basePath, mounted.app);
  const job = out.jobs?.find((j) => j.name === "resolve-place-photos");
  if (!job) throw new Error("resolve-place-photos missing");
  return {
    iso,
    sources,
    run: () => job.spec.handler({ signal: new AbortController().signal }) as Promise<Record<string, number>>,
    photos: async (codes: string) => {
      const res = await app.request(`/v1/places/photos?codes=${codes}`);
      return { status: res.status, body: res.status === 200 ? PlacePhotosVM.parse(await res.json()) : null };
    },
    request: (path: string, init?: RequestInit) => app.request(path, init),
    row: async (code: string) =>
      (
        (await iso.db.execute(sql`
          SELECT status, source, author, attempts, (expires_at = 'infinity') AS forever,
                 CASE WHEN expires_at <> 'infinity'
                      THEN round(extract(epoch FROM expires_at - now()) / 3600)::int END AS hours
          FROM catalog.place_photos WHERE code = ${code}`)) as unknown as {
          status: string;
          source: string | null;
          author: string | null;
          attempts: number;
          forever: boolean;
          hours: number | null;
        }[]
      )[0],
    due: () => iso.db.execute(sql`UPDATE catalog.place_photos SET expires_at = now() - interval '1 minute'`),
  };
}

describe("place photos", () => {
  it("a city asked about is looked up by the job: a Commons photo with its credit, else the satellite view", async () => {
    const t = await setup("place-photos-flow", { wikidata: [london, paris], commons: { "London at night.jpg": {} } });

    // First question: unknown codes are left out; known airports are new — nothing yet, the app shows its own image.
    const first = await t.photos("LHR,cdg,QQQ");
    expect(first.status).toBe(200);
    expect(first.body?.items).toEqual([
      { code: "LHR", kind: "none" },
      { code: "CDG", kind: "none" },
    ]);
    expect(await t.row("LHR")).toMatchObject({ status: "pending", attempts: 0 });
    expect(t.sources.calls).toHaveLength(0); // the route never asks outside

    expect(await t.run()).toEqual({ claimed: 2, photos: 1, satellites: 1, retries: 0, deferred: 0 });
    const second = await t.photos("CDG,LHR");
    expect(second.body?.items).toEqual([
      { code: "CDG", kind: "satellite", lat: 48.856944, lng: 2.351389 },
      {
        code: "LHR",
        kind: "photo",
        card: commonsThumb("London at night.jpg", 500),
        hero: commonsThumb("London at night.jpg", 1280),
        credit: {
          source: "wikimedia",
          author: "Jane Doe",
          license: "CC BY-SA 4.0",
          link: "https://commons.wikimedia.org/wiki/File:London_at_night.jpg",
        },
      },
    ]);
    const lhr = await t.row("LHR");
    expect(lhr).toMatchObject({ status: "photo", source: "wikimedia", attempts: 0 });
    expect(lhr?.hours).toBeGreaterThanOrEqual(30 * 24);
    expect(lhr?.hours).toBeLessThanOrEqual(33 * 24);

    // Nothing due: one query, no request outside.
    const asked = t.sources.calls.length;
    expect(await t.run()).toEqual({ claimed: 0 });
    expect(t.sources.calls).toHaveLength(asked);

    // Asking again adds nothing.
    await t.photos("LHR,CDG");

    // A row another request added between this request's read and its insert is still answered (`none`), never left
    // out as if the code were not an airport.
    await t.iso.db.execute(sql`INSERT INTO catalog.place_photos (code) VALUES ('ZRH')`);
    expect((await placePhotosRepo.addPending(t.iso.db, ["ZRH", "NRT", "QQQ"])).sort()).toEqual(["NRT", "ZRH"]);
    expect(await t.row("ZRH")).toMatchObject({ status: "pending", attempts: 0 });
    await t.iso.db.execute(sql`DELETE FROM catalog.place_photos WHERE code IN ('ZRH', 'NRT')`);
    const count = (await t.iso.db.execute(sql`SELECT count(*)::int AS n FROM catalog.place_photos`)) as unknown as {
      n: number;
    }[];
    expect(count[0]?.n).toBe(2);

    expect((await t.photos("")).status).toBe(400);
    expect((await t.photos("LH1")).status).toBe(400);
    expect((await t.photos(Array.from({ length: 21 }, () => "LHR").join(",") + ",CDG,ZRH")).status).toBe(200);
    await t.iso.drop();
  });

  // PUT and DELETE /v1/internal/places/:code/photo (catalog:import).
  it("an operator's photo replaces the job's, never expires, and the job never touches it", async () => {
    const t = await setup("place-photos-override", {
      wikidata: [london, paris],
      commons: { "London at night.jpg": {} },
    });
    await t.photos("LHR,CDG");
    await t.run();

    const put = (code: string, body: unknown) =>
      t.request(`/v1/internal/places/${code}/photo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const ours = { card: "https://cdn.example.test/cdg-500.jpg", hero: "https://cdn.example.test/cdg-1280.jpg" };
    const res = await put("cdg", ours);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: "CDG", kind: "photo", card: ours.card, hero: ours.hero, credit: null });
    expect(await t.row("CDG")).toMatchObject({ status: "photo", source: "override", forever: true });

    const credited = await put("LHR", { ...ours, credit: { author: "Ion Pop", license: "CC BY 2.0" } });
    expect(await credited.json()).toMatchObject({
      credit: { source: "club", author: "Ion Pop", license: "CC BY 2.0", link: null },
    });

    // Even past its time, an operator's photo is not the job's to look at.
    await t.due();
    expect(await t.run()).toEqual({ claimed: 0 });
    expect(await t.row("CDG")).toMatchObject({ status: "photo", source: "override" });
    expect((await t.photos("CDG")).body?.items).toEqual([
      { code: "CDG", kind: "photo", card: ours.card, hero: ours.hero, credit: null },
    ]);

    expect((await put("ZZZ", ours)).status).toBe(404); // not an airport
    expect((await put("CD1", ours)).status).toBe(400);
    expect((await put("CDG", { ...ours, card: "http://cdn.example.test/x.jpg" })).status).toBe(400);
    expect((await put("CDG", { ...ours, extra: 1 })).status).toBe(400);
    expect((await put("CDG", { ...ours, credit: { link: "ftp://x" } })).status).toBe(400);

    const del = () => t.request("/v1/internal/places/CDG/photo", { method: "DELETE" });
    expect((await del()).status).toBe(204);
    expect(await t.row("CDG")).toMatchObject({ status: "pending", source: null, forever: false });
    expect((await del()).status).toBe(404);
    expect((await t.photos("CDG")).body?.items).toEqual([{ code: "CDG", kind: "none" }]);
    expect(await t.run()).toMatchObject({ claimed: 1, satellites: 1 });
    await t.iso.drop();
  });

  it("a failed source keeps what the row holds and tries again later, an hour more each time", async () => {
    const down = await setup("place-photos-retry", { wikidata: 503 });
    await down.photos("LHR");
    expect(await down.run()).toEqual({ claimed: 1, photos: 0, satellites: 0, retries: 1, deferred: 0 });
    expect(await down.row("LHR")).toMatchObject({ status: "pending", attempts: 1, hours: 1 });
    await down.due();
    await down.run();
    expect(await down.row("LHR")).toMatchObject({ status: "pending", attempts: 2, hours: 2 });
    expect((await down.photos("LHR")).body?.items).toEqual([{ code: "LHR", kind: "none" }]);

    // A photo already shown stays while its source is down.
    const up = await setup("", { wikidata: [london], commons: { "London at night.jpg": {} } }, down.iso);
    await up.due();
    expect(await up.run()).toMatchObject({ photos: 1 });
    expect(await up.row("LHR")).toMatchObject({ status: "photo", attempts: 0 });
    const again = await setup("", { wikidata: 500 }, down.iso);
    await again.due();
    expect(await again.run()).toMatchObject({ claimed: 1, retries: 1 });
    expect(await again.row("LHR")).toMatchObject({ status: "photo", source: "wikimedia", attempts: 1, hours: 1 });
    expect((await again.photos("LHR")).body?.items[0]).toMatchObject({ kind: "photo" });
    await down.iso.drop();
  });

  it("a claimed city whose airport does not come back waits like a failed source", async () => {
    const t = await setup("place-photos-no-airport", {});
    // A code the job cannot match: it asks for airports by upper-case code, so `ab1` (`AB1`, no airport) never comes back.
    await t.iso.db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng)
      VALUES ('ab1', 'Nowhere', 'Nowhere', 'Nowhere', 'NW', 'Europe', 1, 2)`);
    await t.iso.db.execute(sql`INSERT INTO catalog.place_photos (code) VALUES ('ab1')`);
    expect(await t.run()).toEqual({ claimed: 1, photos: 0, satellites: 0, retries: 1, deferred: 0 });
    expect(await t.row("ab1")).toMatchObject({ status: "pending", attempts: 1, hours: 1 });
    expect(t.sources.calls).toHaveLength(0);
    await t.iso.drop();
  });

  it("a key Pexels refuses: a city that shows a photo keeps it, one without gets its satellite view for a day", async () => {
    const t = await setup("place-photos-refused", { wikidata: [paris], pexels: { Paris: 401 } }, undefined, {
      PEXELS_API_KEY: "test".repeat(10), // a stand-in, not a key
    });
    // London shows a Pexels photo from an earlier run and is due again; Paris is new (its only file is a montage).
    await t.iso.db.execute(sql`
      INSERT INTO catalog.place_photos (code, status, source, card_url, hero_url, author, license, link, expires_at)
      VALUES ('LHR', 'photo', 'pexels', 'https://images.pexels.com/photos/1/a.jpeg?w=940',
              'https://images.pexels.com/photos/1/a.jpeg?w=1880', 'Ana Pop', 'Pexels License',
              'https://www.pexels.com/photo/1/', now() - interval '1 minute')`);
    await t.photos("CDG");
    expect(await t.run()).toEqual({ claimed: 2, photos: 0, satellites: 1, retries: 1, deferred: 0 });
    expect(await t.row("LHR")).toMatchObject({ status: "photo", source: "pexels", attempts: 1, hours: 1 });
    expect(await t.row("CDG")).toMatchObject({ status: "satellite", attempts: 0, hours: 24 });
    expect(t.sources.calls.filter((c) => c.url.includes("pexels"))).toHaveLength(1);
    await t.iso.drop();
  });

  it("flag off: no photos, no rows, no lookups", async () => {
    const t = await setup("place-photos-off", { wikidata: [london] });
    await t.iso.db.execute(sql`
      INSERT INTO platform.flags (key, value) VALUES ('catalog.place_photos', '{"enabled": false}')`);
    expect((await t.photos("LHR")).body).toEqual({ items: [] });
    expect(await t.row("LHR")).toBeUndefined();
    await t.iso.db.execute(sql`INSERT INTO catalog.place_photos (code) VALUES ('LHR')`);
    expect(await t.run()).toEqual({ skipped: 1 });
    expect(t.sources.calls).toHaveLength(0);
    expect(await t.row("LHR")).toMatchObject({ status: "pending", attempts: 0 });
    await t.iso.drop();
  });

  it("the database keeps a row honest", async () => {
    const iso = await isolatedDb("place-photos-checks");
    const bad = [
      sql`INSERT INTO catalog.place_photos (code, status) VALUES ('LHR', 'photo')`,
      sql`INSERT INTO catalog.place_photos (code, source) VALUES ('LHR', 'pexels')`,
      sql`INSERT INTO catalog.place_photos (code, status, source, card_url, hero_url)
          VALUES ('LHR', 'photo', 'wikimedia', 'https://a/c.jpg', 'https://a/h.jpg')`,
      sql`INSERT INTO catalog.place_photos (code, status, source, card_url, hero_url, link)
          VALUES ('LHR', 'photo', 'pexels', 'http://a/c.jpg', 'https://a/h.jpg', 'https://a')`,
      sql`INSERT INTO catalog.place_photos (code, status) VALUES ('LHR', 'satellite')`,
      sql`INSERT INTO catalog.place_photos (code, status, lat, lng) VALUES ('LHR', 'satellite', 91, 0)`,
      sql`INSERT INTO catalog.place_photos (code) VALUES ('QQQ')`,
      sql`INSERT INTO catalog.place_photos (code, attempts) VALUES ('LHR', -1)`,
    ];
    for (const statement of bad) {
      let failed = false;
      try {
        await iso.db.execute(statement);
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    }
    await iso.db.execute(sql`
      INSERT INTO catalog.place_photos (code, status, source, card_url, hero_url)
      VALUES ('LHR', 'photo', 'override', 'https://a/c.jpg', 'https://a/h.jpg')`);
    await iso.db.execute(sql`DELETE FROM catalog.airports WHERE code = 'LHR'`);
    const left = (await iso.db.execute(sql`SELECT count(*)::int AS n FROM catalog.place_photos`)) as unknown as {
      n: number;
    }[];
    expect(left[0]?.n).toBe(0); // an airport removed takes its photo with it
    await iso.drop();
  });
});
