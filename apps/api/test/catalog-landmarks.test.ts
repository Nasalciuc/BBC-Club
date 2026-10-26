/** ADR-IMPL-064: GET /v1/places/:code/landmarks through the whole host — its shape, its ETag, 404, and who may ask —
 *  and the landmark that stands in for a city photo on GET /v1/places/photos (amendment 1). */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { PlaceLandmarksVM, PlacePhotosVM, type PlacePhotoVM } from "@bbc/shared/api/v1/places";
import { testApp } from "./helpers/test-app";

describe("GET /v1/places/:code/landmarks", () => {
  it("a member reads a city's landmarks best first, with an ETag; 404 for no airport; nobody else reads them", async () => {
    const t = await testApp({ suite: "catalog-landmarks" });
    await t.seedCatalogBasics();
    // Rows as the resolve-place-landmarks job writes them (made-up names and authors).
    for (const rank of [1, 2]) {
      await t.db.execute(sql`
        INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, landmark_qid, name, file, image_url, width,
          height, licence, licence_url, credit, expires_at)
        VALUES ('CDG', ${rank}, 'landmark', 'Q90', ${`Q${100 + rank}`}, ${`Sight ${rank}`}, ${`Sight ${rank}.jpg`},
          ${`https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sight_${rank}.jpg/1280px-Sight_${rank}.jpg`},
          1280, 853, 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0', 'Ana Pop · Wikimedia Commons',
          now() + interval '30 days')`);
    }
    await t.db.execute(sql`
      INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, expires_at)
      VALUES ('CDG', 3, 'fewer', 'Q90', now() + interval '30 days')`);
    const cookie = { Cookie: t.memberA.cookie };
    const get = (code: string, headers: Record<string, string> = cookie) =>
      t.app.request(`/v1/places/${code}/landmarks`, { headers });

    // Seeded off: none served.
    expect(await (await get("CDG")).json()).toEqual({ code: "CDG", landmarks: [] });

    await t.flags.set("catalog.landmarks", { enabled: true, skip: [] });
    const res = await get("cdg");
    expect(res.status).toBe(200);
    const body = PlaceLandmarksVM.parse(await res.json());
    expect(body).toEqual({
      code: "CDG",
      landmarks: [1, 2].map((rank) => ({
        name: `Sight ${rank}`,
        imageUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sight_${rank}.jpg/1280px-Sight_${rank}.jpg`,
        width: 1280,
        height: 853,
        credit: {
          text: "Ana Pop · Wikimedia Commons",
          licence: "CC BY-SA 4.0",
          licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        },
      })),
    });
    const etag = res.headers.get("ETag") ?? "";
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    const unchanged = await get("CDG", { ...cookie, "If-None-Match": etag });
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get("ETag")).toBe(etag);

    // An airport with nothing looked up yet: an empty list. No airport: 404.
    expect(PlaceLandmarksVM.parse(await (await get("LHR")).json()).landmarks).toEqual([]);
    expect((await get("QQQ")).status).toBe(404);
    expect((await get("C1G")).status).toBe(404);

    // A member's route: no anonymous reader, and the internal secret is not one.
    expect((await get("CDG", {})).status).toBe(401);
    expect((await get("CDG", { "X-Internal-Secret": t.internalSecret })).status).toBe(403);
    await t.close();
  });
});

describe("GET /v1/places/photos — a landmark stands in (ADR-IMPL-064, amendment 1)", () => {
  it("where a city has only its satellite view, its first landmark's photograph with that photograph's credit", async () => {
    const t = await testApp({ suite: "catalog-landmark-photo" });
    await t.seedCatalogBasics();
    await t.db.execute(sql`
      INSERT INTO catalog.place_photos (code, status, lat, lng, expires_at)
      VALUES ('CDG', 'satellite', 48.856944, 2.351389, now() + interval '30 days')`);
    // Rows as the resolve-place-landmarks job writes them (made-up names and authors).
    for (const rank of [1, 2]) {
      await t.db.execute(sql`
        INSERT INTO catalog.place_landmarks (code, rank, kind, city_qid, landmark_qid, name, file, image_url, width,
          height, licence, licence_url, credit, expires_at)
        VALUES ('CDG', ${rank}, 'landmark', 'Q90', ${`Q${100 + rank}`}, ${`Sight ${rank}`}, ${`Sight ${rank}.jpg`},
          ${`https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sight_${rank}.jpg/1280px-Sight_${rank}.jpg`},
          1280, 853, 'FAL', 'https://artlibre.org/licence/lal/en', 'Ana Pop · Wikimedia Commons',
          now() + interval '30 days')`);
    }
    const photo = async () => {
      const res = await t.app.request("/v1/places/photos?codes=CDG", { headers: { Cookie: t.memberA.cookie } });
      expect(res.status).toBe(200);
      return PlacePhotosVM.parse(await res.json()).items;
    };
    const satellite = { code: "CDG", kind: "satellite", lat: 48.856944, lng: 2.351389 } as const;

    // Seeded off: the satellite view, as before.
    expect(await photo()).toEqual([satellite]);

    await t.flags.set("catalog.landmarks", { enabled: true, skip: [] });
    const sight = (rank: number): PlacePhotoVM => ({
      code: "CDG",
      kind: "photo",
      card: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sight_${rank}.jpg/500px-Sight_${rank}.jpg`,
      hero: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sight_${rank}.jpg/1280px-Sight_${rank}.jpg`,
      credit: {
        source: "wikimedia",
        author: "Ana Pop",
        license: "FAL",
        link: `https://commons.wikimedia.org/wiki/File:Sight_${rank}.jpg`,
      },
    });
    expect(await photo()).toEqual([sight(1)]);
    // The operator keeps the first out: the next one at once.
    await t.flags.set("catalog.landmarks", { enabled: true, skip: ["Q101"] });
    expect(await photo()).toEqual([sight(2)]);
    await t.close();
  });
});
