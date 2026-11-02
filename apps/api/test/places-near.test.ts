/** ADR-IMPL-083: GET /v1/places/near through the whole host — where a tap on the globe fell: the town that names it
 *  and the airports near it, from the reference data migrate.ts loads; nothing while the flag is off; who may ask. */
import { describe, expect, it } from "bun:test";
import { PLACES_NEAR_AIRPORTS, PlacesNearVM } from "@bbc/shared/api/v1/fares";
import { testApp } from "./helpers/test-app";

describe("GET /v1/places/near", () => {
  it("names the town under the finger and lists the airports near it, nearest first; nothing while the flag is off", async () => {
    const t = await testApp({ suite: "places-near" });
    const cookie = { Cookie: t.memberA.cookie };
    const near = (q: string, headers: Record<string, string> = cookie) =>
      t.app.request(`/v1/places/near?${q}`, { headers });

    // Bălți's streets, from GeoNames' point a few hundred metres off.
    const balti = "lat=47.76&lng=27.93";
    // Seeded off: nothing read, nothing answered.
    expect(await (await near(balti)).json()).toEqual({ locality: null, airports: [] });

    await t.flags.set("catalog.globe_tap", { enabled: true });
    const res = await near(balti);
    expect(res.status).toBe(200);
    const body = PlacesNearVM.parse(await res.json());
    expect(body.locality).toMatchObject({ name: "Bălţi", countryCode: "MD" });
    expect(body.locality!.km).toBeLessThan(1);
    const codes = body.airports.map((a) => a.code);
    // Iași, Suceava, Chișinău — any airport with scheduled service, not only the club's cities.
    expect(codes.slice(0, 3)).toEqual(["IAS", "SCV", "RMO"]);
    expect(body.airports.length).toBeLessThanOrEqual(PLACES_NEAR_AIRPORTS);
    const kms = body.airports.map((a) => a.km);
    expect(kms).toEqual([...kms].sort((a, b) => a - b));
    expect(body.airports[0]).toMatchObject({ city: "Iași", countryCode: "RO", tz: "Europe/Bucharest" });
    for (const a of body.airports) expect(a.km).toBeLessThanOrEqual(600);

    // A city's own streets are the city's, not a suburb's: midtown Chișinău.
    const chisinau = PlacesNearVM.parse(await (await near("lat=47.03&lng=28.83")).json());
    expect(chisinau.locality?.name).toBe("Chisinau");

    // Open sea, far from any coast: no town, no airport.
    expect(await (await near("lat=-40&lng=-120")).json()).toEqual({ locality: null, airports: [] });

    // A globe turned past the antimeridian asks about the same place.
    const wrapped = PlacesNearVM.parse(await (await near("lat=47.76&lng=387.93")).json());
    expect(wrapped.airports.map((a) => a.code)).toEqual(codes);

    // Not a point: 400; nobody but a member asks.
    for (const q of ["lat=91&lng=0", "lat=47.7&lng=", "lat=abc&lng=1", "lng=1", "lat=1e2&lng=3"]) {
      expect((await near(q)).status).toBe(400);
    }
    expect((await near(balti, {})).status).toBe(401);
    await t.close();
  });
});
