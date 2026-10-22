/** ADR-IMPL-056: the trip a fare's price is for (04 and 13 print `round trip` beside a fare) and a destination's one
 *  line under its city (04), from the catalogue's imports to every answer that carries a fare or an airport. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { PopularVM } from "@bbc/shared/api/v1/discovery";
import { AirportVM, FareVM, HomeVM, SearchResultVM } from "@bbc/shared/api/v1/fares";
import { testApp } from "./helpers/test-app";

const LINE = "Iconic sights, world-class culture and unforgettable experiences.";

describe("a fare's trip", () => {
  it("is one way unless its import row says round trip; a re-import restates it, an unknown one refuses the file", async () => {
    const t = await testApp({ suite: "catalog-trip" });
    await t.seedCatalogBasics();
    const cookie = { headers: { Cookie: t.memberA.cookie } };
    const until = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const head =
      "route_from,route_to,cabin,carrier,carrier_name,nonstop,duration_minutes,price,currency,valid_from,valid_until";
    const importFares = (csv: string) =>
      t.app.request("/v1/internal/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
        body: JSON.stringify({ kind: "fares", csv }),
      });
    const search = async () =>
      SearchResultVM.parse(await (await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business", cookie)).json());
    const tripOf = async (carrier: string) => (await search()).items.find((f) => f.carrier.code === carrier)?.trip;

    // Every fare there is says one way: the column's default filled them (0031).
    expect(new Set((await search()).items.map((f) => f.trip))).toEqual(new Set(["one_way"]));

    // The file says round trip for one row and nothing in another's cell.
    const withTrip = [
      `${head},trip`,
      `JFK,LHR,business,UA,United,true,430,4600.00,USD,${from},${until},round_trip`,
      `JFK,LHR,business,DL,Delta,true,425,4700.00,USD,${from},${until},`,
    ].join("\n");
    expect((await importFares(withTrip)).status).toBe(200);
    expect([await tripOf("UA"), await tripOf("DL"), await tripOf("BA")]).toEqual(["round_trip", "one_way", "one_way"]);
    const [ua] = (await t.db.execute(
      sql`SELECT id FROM catalog.fares WHERE route_from = 'JFK' AND route_to = 'LHR' AND carrier = 'UA'`,
    )) as unknown as { id: string }[];
    const fare = FareVM.parse(await (await t.app.request(`/v1/fares/${ua!.id}`, cookie)).json());
    expect(fare.trip).toBe("round_trip");

    // The same fare from a file without the column: its price restated, and with it one way.
    expect(
      (await importFares([head, `JFK,LHR,business,UA,United,true,430,4650.00,USD,${from},${until}`].join("\n"))).status,
    ).toBe(200);
    expect(await tripOf("UA")).toBe("one_way");

    // A trip the catalogue does not know refuses the whole file: nothing of it is written.
    const odd = await importFares(
      [`${head},trip`, `JFK,LHR,business,UA,United,true,430,4999.00,USD,${from},${until},return`].join("\n"),
    );
    expect(odd.status).toBe(400);
    expect((await search()).items.find((f) => f.carrier.code === "UA")?.price.offer).toBe(4650);
    await t.close();
  }, 60_000);
});

describe("a destination's one line", () => {
  it("reaches every airport answer and Home past its ETag; kept by a file without it, cleared by an empty cell", async () => {
    const t = await testApp({ suite: "catalog-description" });
    await t.seedCatalogBasics();
    const cookie = { headers: { Cookie: t.memberA.cookie } };
    const head = "code,name,city,country,country_code,region,lat,lng,popularity,tz";
    const lhr = "LHR,Heathrow,London,United Kingdom,GB,europe,51.47,-0.4543,98,Europe/London";
    const importAirports = (csv: string) =>
      t.app.request("/v1/internal/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
        body: JSON.stringify({ kind: "airports", csv }),
      });
    const home = async (etag?: string) => {
      const r = await t.app.request("/v1/home", {
        headers: { Cookie: t.memberA.cookie, ...(etag ? { "If-None-Match": etag } : {}) },
      });
      return { status: r.status, etag: r.headers.get("ETag"), body: r.status === 200 ? await r.json() : null };
    };
    const lineOf = async () => {
      const search = SearchResultVM.parse(
        await (await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business", cookie)).json(),
      );
      return search.to.description;
    };

    // None yet: the line is left out, never made up.
    const before = await home();
    expect(HomeVM.parse(before.body).destinations.find((d) => d.code === "LHR")?.description).toBeNull();
    expect(await lineOf()).toBeNull();

    // The airports import writes it (quoted: it has commas).
    expect((await importAirports([`${head},description`, `${lhr},"${LINE}"`].join("\n"))).status).toBe(200);
    // Home: a new body, so a new tag — the app's old one gets the line, not a 304.
    const after = await home(before.etag!);
    expect(after.status).toBe(200);
    expect(after.etag).not.toBe(before.etag);
    const body = HomeVM.parse(after.body);
    expect(body.destinations.find((d) => d.code === "LHR")?.description).toBe(LINE);
    expect(body.home?.description).toBeNull(); // New York has none
    expect((await home(after.etag!)).status).toBe(304);
    // The search, the airport search and Popular from New York.
    expect(await lineOf()).toBe(LINE);
    const airports = (await (await t.app.request("/v1/airports?q=LHR", cookie)).json()) as unknown[];
    expect(airports.map((a) => AirportVM.parse(a)).find((a) => a.code === "LHR")?.description).toBe(LINE);
    const popular = PopularVM.parse(await (await t.app.request("/v1/airports/popular?from=JFK", cookie)).json());
    expect(popular.destinations.find((a) => a.code === "LHR")?.description).toBe(LINE);

    // A file without the column changes the airport and keeps its line.
    expect((await importAirports([head, lhr.replace(",98,", ",97,")].join("\n"))).status).toBe(200);
    expect(await lineOf()).toBe(LINE);
    // Over 160 characters refuses the file; an empty cell clears the line.
    expect((await importAirports([`${head},description`, `${lhr},${"x".repeat(161)}`].join("\n"))).status).toBe(400);
    expect(await lineOf()).toBe(LINE);
    expect((await importAirports([`${head},description`, `${lhr},`].join("\n"))).status).toBe(200);
    expect(await lineOf()).toBeNull();

    // A CSV-escaped quote (`""`) is a quote in the line, and a line break inside quotes stays in its cell (RFC 4180):
    // the quotes used to vanish, and the break to split the record and refuse the file.
    const quoted = `"The ""Big Smoke"", by the Thames."`;
    expect((await importAirports([`${head},description`, `${lhr},${quoted}`].join("\n"))).status).toBe(200);
    expect(await lineOf()).toBe(`The "Big Smoke", by the Thames.`);
    const twoLines = await importAirports([`${head},description`, `${lhr},"Old river,\nnew city."`].join("\n"));
    expect(twoLines.status).toBe(200);
    expect(await lineOf()).toBe("Old river,\nnew city.");

    // The database refuses a blank line written past the import.
    const blank = await t.db
      .execute(sql`UPDATE catalog.airports SET description = '   ' WHERE code = 'LHR'`)
      .then(() => "ok")
      .catch((err: { code?: string; cause?: { code?: string } }) => err.code ?? err.cause?.code);
    expect(blank).toBe("23514");
    await t.close();
  }, 60_000);
});
