import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";
import { FareVM, AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";
import { toFareVM, type CatalogFacade } from "@bbc/catalog";
import { fixture } from "@bbc/shared/fixture";
import { storedPricingRules } from "../../../packages/modules/domain/catalog/src/pricing/rules";
import { FIXTURE_RULES } from "../../../packages/modules/domain/catalog/tests/unit/pricing-rules.fixture";

describe("catalog routes", () => {
  it("GET /v1/search?from=JFK&to=LHR&cabin=business → ≥3 fares", async () => {
    const t = await testApp({ suite: "catalog-search" });
    await t.seedCatalogBasics();
    const r = await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business", {
      headers: { Cookie: t.memberA.cookie },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.items.length).toBeGreaterThanOrEqual(3);
    expect(body.from.code).toBe("JFK");
    expect(body.to.code).toBe("LHR");
    for (const item of body.items) expect(() => FareVM.parse(item)).not.toThrow();
    await t.close();
  });

  it("GET /v1/fares/:id → 410 when past valid_until", async () => {
    const t = await testApp({ suite: "catalog-410" });
    const id = await t.seedExpiredFare();
    const r = await t.app.request(`/v1/fares/${id}`, { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(410);
    const body = (await r.json()) as { error?: { code?: string; context?: Record<string, unknown> } };
    expect(body.error?.code).toBe("GONE");
    expect(body.error?.context).toBeDefined();
    expect(typeof body.error?.context?.price).toBe("number");
    expect(typeof body.error?.context?.from).toBe("string");
    // Figma 135:848 names what closed: the cities, the airline and cabin; a fare without times has no day.
    expect(body.error?.context).toMatchObject({
      fromCity: "New York",
      toCity: "London",
      carrier: "Delta",
      cabin: "business",
      departDate: null,
    });
    await t.close();
  });

  // A malformed id, a NUL byte or a date no calendar holds is the member's input, never a server error: each used to
  // reach Postgres (a uuid cast, a NUL in text, a year out of range) and answer 500 INTERNAL.
  it("bad input is a 404 or a 400 before any query, never a 500", async () => {
    const t = await testApp({ suite: "catalog-bad-input" });
    await t.seedCatalogBasics();
    const status = async (path: string) =>
      (await t.app.request(path, { headers: { Cookie: t.memberA.cookie } })).status;
    const day = 86_400_000;
    const at = (ms: number) => encodeURIComponent(new Date(Date.now() + ms).toISOString());
    const search = "/v1/search?from=JFK&to=LHR&cabin=business";
    expect({
      fareNotUuid: await status("/v1/fares/abc"),
      fareUnknown: await status("/v1/fares/00000000-0000-4000-8000-000000000000"),
      airportsNul: await status("/v1/airports?q=lon%00don"),
      searchFromNul: await status("/v1/search?from=J%00K&to=LHR&cabin=business"),
      searchToDigits: await status("/v1/search?from=JFK&to=1A2&cabin=business"),
      whenYearZero: await status(`${search}&when=0000-01-01T00:00:00Z`),
      whenNegativeYear: await status(`${search}&when=-000001-01-01T00:00:00Z`),
      whenFarFuture: await status(`${search}&when=%2B275760-09-13T00:00:00.000Z`),
      whenLastWeek: await status(`${search}&when=${at(-7 * day)}`),
      whenIn3Years: await status(`${search}&when=${at(3 * 365 * day)}`),
      whenToday: await status(`${search}&when=${at(0)}`),
      whenNextMonth: await status(`${search}&when=${at(30 * day)}`),
    }).toEqual({
      fareNotUuid: 404,
      fareUnknown: 404,
      airportsNul: 400,
      searchFromNul: 400,
      searchToDigits: 400,
      whenYearZero: 400,
      whenNegativeYear: 400,
      whenFarFuture: 400,
      whenLastWeek: 400,
      whenIn3Years: 400,
      whenToday: 200,
      whenNextMonth: 200,
    });
    await t.close();
  });

  // ADR-IMPL-041 (amended): a fare is listed only while it is on sale (as its page reads it, so no item opens on a
  // 410); a travel date picks a timed fare by its departure day in the origin's zone, an undated one while it is sold.
  it("a dated search finds a flight on its own day, and never a fare not on sale yet", async () => {
    const t = await testApp({ suite: "catalog-dated-search" });
    await t.seedCatalogBasics();
    const DAY = 86_400_000;
    // Day D, three weeks out, in New York; the flight leaves at 20:10 there — already the next day in UTC.
    const d = new Date(Date.now() + 21 * DAY).toISOString().slice(0, 10);
    const departAt = new Date(`${d}T20:10:00-05:00`);
    const idOf = (rows: unknown) => (rows as { id: string }[])[0]?.id ?? "";
    const timed = idOf(
      await t.db.execute(sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, carrier_name, nonstop, duration_minutes,
        depart_at, arrive_at, price, currency, source, valid_from, valid_until, published)
      VALUES ('JFK', 'LHR', 'business', 'VS', 'Virgin Atlantic', true, 410,
        ${departAt.toISOString()}::timestamptz, ${new Date(departAt.getTime() + 410 * 60_000).toISOString()}::timestamptz,
        '4350.00', 'USD', 'manual', now() - interval '1 day', ${new Date(departAt.getTime() - DAY).toISOString()}::timestamptz, true)
      RETURNING id`),
    );
    // On sale from ten days ahead: its page answers 410 until then, so no search lists it.
    const later = idOf(
      await t.db.execute(sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, carrier_name, nonstop, duration_minutes,
        price, currency, source, valid_from, valid_until, published)
      VALUES ('JFK', 'LHR', 'business', 'LX', 'Swiss', true, 430, '3990.00', 'USD', 'manual',
        now() + interval '10 days', now() + interval '40 days', true)
      RETURNING id`),
    );
    const ids = async (when?: string) => {
      const query = new URLSearchParams({ from: "JFK", to: "LHR", cabin: "business", ...(when ? { when } : {}) });
      const r = await t.app.request(`/v1/search?${query}`, { headers: { Cookie: t.memberA.cookie } });
      expect(r.status).toBe(200);
      return ((await r.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    };
    const noon = (ymd: string) => `${ymd}T12:00:00.000Z`; // what the app sends for a chosen day
    const shift = (days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

    expect(await ids(noon(d))).toContain(timed); // its own day, though its sale closed the day before
    expect(await ids(noon(shift(-1)))).not.toContain(timed);
    expect(await ids(noon(shift(1)))).not.toContain(timed);
    expect(await ids()).toContain(timed); // undated: on sale now

    for (const when of [undefined, noon(shift(-10)), noon(d), noon(shift(10))]) {
      expect({ when, listed: (await ids(when)).includes(later) }).toEqual({ when, listed: false });
    }
    expect((await t.app.request(`/v1/fares/${later}`, { headers: { Cookie: t.memberA.cookie } })).status).toBe(410);

    // An undated fare (sold for 30 days) is any day's while it is sold, not past it.
    const ba = idOf(
      await t.db.execute(
        sql`SELECT id FROM catalog.fares WHERE route_from = 'JFK' AND route_to = 'LHR' AND carrier = 'BA'`,
      ),
    );
    expect(await ids(noon(shift(0)))).toContain(ba);
    expect(await ids(new Date(Date.now() + 35 * DAY).toISOString())).not.toContain(ba);
    await t.close();
  });

  it("401/403 responses do not carry error.context", async () => {
    const t = await testApp({ suite: "catalog-authz-context" });
    const anon = await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business");
    expect(anon.status).toBe(401);
    const anonBody = (await anon.json()) as { error?: { context?: unknown } };
    expect(anonBody.error?.context).toBeUndefined();

    const forbidden = await t.app.request("/v1/internal/catalog/import", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: "{}",
    });
    expect([401, 403]).toContain(forbidden.status);
    const forbiddenBody = (await forbidden.json()) as { error?: { context?: unknown } };
    expect(forbiddenBody.error?.context).toBeUndefined();
    await t.close();
  });

  it("GET /v1/airports?q=JF ranks JFK first", async () => {
    const t = await testApp({ suite: "catalog-airports" });
    await t.seedCatalogBasics();
    const r = await t.app.request("/v1/airports?q=JF", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any[];
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].code).toBe("JFK");
    expect(body.length).toBeLessThanOrEqual(8);
    expect(() => AirportVM.parse(body[0])).not.toThrow();
    await t.close();
  });

  // ADR-IMPL-037: the company's formula as an indicative price — only where an undated search has no fare, only when the
  // catalog.estimates flag is on, and only with valid rules in catalog.pricing_rules. Never mixed with fares, never in
  // the reference-price fields. The rules here are made up (FIXTURE_RULES): the company's are not in this repository.
  it("GET /v1/search shows the formula's estimate only where there is no fare", async () => {
    const t = await testApp({ suite: "catalog-estimates" });
    await t.seedCatalogBasics();
    const search = async (from: string, to: string, cabin = "business", when?: string) => {
      const query = new URLSearchParams({ from, to, cabin, ...(when ? { when } : {}) });
      const r = await t.app.request(`/v1/search?${query}`, { headers: { Cookie: t.memberA.cookie } });
      expect(r.status).toBe(200);
      return (await r.json()) as {
        from: { tz?: string };
        items: unknown[];
        estimate?: { amount: number; currency: string; trip: string; cabin: string; basis: string } | null;
      };
    };

    // Off by default: no estimate anywhere.
    expect((await search("JFK", "ZRH")).estimate).toBeNull();

    // On, but this environment has no rules yet: still no estimate, and the search does not fail.
    await t.flags.set("catalog.estimates", { enabled: true });
    expect((await search("JFK", "ZRH")).estimate).toBeNull();

    await t.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));
    const zurich = await search("JFK", "ZRH");
    expect(zurich.items).toEqual([]);
    expect(zurich.estimate).toEqual({
      amount: 1633,
      currency: "USD",
      trip: "round_trip",
      cabin: "business",
      basis: "formula",
    });
    expect(zurich.from.tz).toBe("America/New_York"); // for the local time at the destination
    expect((await search("ZRH", "JFK")).estimate?.amount).toBe(1633); // the formula has no direction

    const london = await search("JFK", "LHR"); // published fares exist: they win
    expect(london.items.length).toBeGreaterThan(0);
    expect(london.estimate).toBeNull();

    expect((await search("RMO", "LHR")).estimate).toBeNull(); // outside North America: on request, never invented

    // First follows the chosen cabin: above business on this route, so it shows.
    expect((await search("JFK", "ZRH", "first")).estimate).toEqual({
      amount: 1776,
      currency: "USD",
      trip: "round_trip",
      cabin: "first",
      basis: "formula",
    });

    // Two airports of the same metro: the formula has a price, nothing is shown.
    expect((await search("JFK", "EWR")).estimate).toBeNull();

    // A dated search: the route may have fares on other days, and published fares win — no undated estimate.
    // (A day a month ahead: a past day is refused.)
    const inAMonth = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect((await search("JFK", "ZRH", "business", inAMonth)).estimate).toBeNull();

    // Rules edited by hand (their fingerprint is no longer their own): refused, no estimate.
    const stored = storedPricingRules(FIXTURE_RULES);
    await t.flags.set("catalog.pricing_rules", {
      ...stored,
      rules: { ...stored.rules, hawaii_extra: { business: 1, first: 2, premium_economy: 3 } },
    });
    expect((await search("JFK", "ZRH")).estimate).toBeNull();

    // Shown and missing estimates are counted, so the rollout can be watched.
    const metrics = await (await t.app.request("/metrics")).text();
    expect(metrics).toContain('bbc_search_estimates_shown{cabin="business"}');
    expect(metrics).toContain('bbc_search_estimates_shown{cabin="first"} 1');
    expect(metrics).toContain('bbc_search_estimates_unavailable{reason="missing"} 1');
    expect(metrics).toContain('bbc_search_estimates_unavailable{reason="invalid"} 1');
    await t.close();
  });

  // ADR-IMPL-036: the reference airports make any city findable; the search forgives accents, typos and nicknames.
  it("GET /v1/airports finds what members actually type", async () => {
    const t = await testApp({ suite: "catalog-airport-search" });
    await t.seedCatalogBasics();
    const codes = async (q: string) => {
      const r = await t.app.request(`/v1/airports?q=${encodeURIComponent(q)}`, {
        headers: { Cookie: t.memberA.cookie },
      });
      expect(r.status).toBe(200);
      return ((await r.json()) as { code: string }[]).map((a) => a.code);
    };
    expect((await codes("LHR"))[0]).toBe("LHR"); // the exact code comes first
    // 18: a city's airports come together, the busiest city first — London's before Long Beach and Longview.
    const lon = await codes("Lon");
    expect(lon.slice(0, 3)).toEqual(["LHR", "LGW", "STN"]);
    expect(lon).toContain("LCY");
    expect(lon.indexOf("LCY")).toBeLessThan(lon.indexOf("LGB"));
    // A city's weight counts only its airports in the same tier: `L` leads with London's by code, together — not with
    // LaGuardia, lifted by JFK's looser match.
    expect((await codes("L")).slice(0, 4)).toEqual(["LHR", "LGW", "LTN", "LCY"]);
    expect(await codes("lodon")).toContain("LHR"); // a typo
    expect(await codes("new yrok")).toContain("JFK");
    expect(await codes("Zürich")).toContain("ZRH"); // accents either way
    expect(await codes("Chișinău")).toContain("RMO");
    expect(await codes("sao paulo")).toContain("GRU");
    expect(await codes("KIV")).toContain("RMO"); // Chișinău's former code
    expect(await codes("TYO")).toContain("NRT"); // a metro code
    expect(await codes("Bucharest")).toContain("OTP"); // the city served, not the town (Otopeni)
    expect(await codes("new york")).toContain("EWR"); // Newark serves New York
    expect(await codes("Japan")).toEqual(expect.arrayContaining(["HND", "NRT"])); // a country
    expect((await codes("UK"))[0]).toBe("LHR"); // a country nickname means the country, busiest first
    expect((await codes("USA"))[0]).toBe("JFK"); // not the regional airport whose code is USA
    // ADR-IMPL-038: the corrected cities — found by the city members fly to, typed without its marks, and by the
    // locality's own name where it is one people use.
    expect((await codes("Cincinnati"))[0]).toBe("CVG"); // not "Hebron"
    expect((await codes("bora bora"))[0]).toBe("BOB");
    expect((await codes("bodo"))[0]).toBe("BOO"); // Bodø
    expect((await codes("lodz"))[0]).toBe("LCJ"); // Łódź
    expect(await codes("Ezeiza")).toContain("EZE"); // Buenos Aires now, its own name still searchable
    expect((await codes("lo")).length).toBeLessThanOrEqual(8);
    expect(await codes("%")).toEqual([]); // a wildcard character is matched literally, not as "anything"
    expect(await codes("_")).toEqual([]);
    await t.close();
  });

  // ADR-IMPL-036's typo tolerance: two letters swapped in a short city drop its trigram similarity under the typo tier's
  // threshold, so `Pairs`, `Toyko` and `Lodnon` found nothing.
  it("GET /v1/airports forgives two letters swapped", async () => {
    const t = await testApp({ suite: "catalog-airport-swaps" });
    const codes = async (q: string) => {
      const r = await t.app.request(`/v1/airports?q=${encodeURIComponent(q)}`, {
        headers: { Cookie: t.memberA.cookie },
      });
      expect(r.status).toBe(200);
      return ((await r.json()) as { code: string; city: string }[]).map((a) => a.code);
    };
    expect((await codes("Pairs"))[0]).toBe("CDG"); // Paris's group, the busiest first
    expect((await codes("Toyko")).slice(0, 2)).toEqual(["HND", "NRT"]);
    expect((await codes("Lodnon")).slice(0, 2)).toEqual(["LHR", "LGW"]);
    expect((await codes("Pairs")).slice(0, 2)).toEqual(["CDG", "ORY"]);
    // What already worked still does: a letter missing, two at the end swapped, the city itself.
    expect(await codes("Lodon")).toContain("LHR");
    expect(await codes("Londno")).toContain("LHR");
    expect((await codes("Paris"))[0]).toBe("CDG");
    expect((await codes("Tokyo"))[0]).toBe("HND");
    await t.close();
  });

  it("unauthenticated search → 401; import requires internal secret", async () => {
    const t = await testApp({ suite: "catalog-authz" });
    expect((await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business")).status).toBe(401);
    expect(
      (
        await t.app.request("/v1/internal/catalog/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "fares", csv: "x" }),
        })
      ).status,
    ).toBe(401);
    await t.close();
  });

  it("import fares is idempotent", async () => {
    const t = await testApp({ suite: "catalog-import" });
    await t.seedCatalogBasics();
    const until = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const csv = [
      "route_from,route_to,cabin,carrier,carrier_name,product,nonstop,duration_minutes,price,published_price,published_source,currency,valid_from,valid_until",
      `JFK,LHR,business,UA,United,Polaris,true,430,4600.00,8200.00,Sabre · test,USD,${from},${until}`,
    ].join("\n");
    const headers = {
      "Content-Type": "application/json",
      "X-Internal-Secret": t.internalSecret,
    };
    const once = await t.app.request("/v1/internal/catalog/import", {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "fares", csv }),
    });
    expect(once.status).toBe(200);
    const twice = await t.app.request("/v1/internal/catalog/import", {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "fares", csv }),
    });
    expect(twice.status).toBe(200);
    const search = await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business", {
      headers: { Cookie: t.memberA.cookie },
    });
    const items = ((await search.json()) as any).items as any[];
    expect(items.filter((i) => i.carrier.code === "UA").length).toBe(1);
    await t.close();
  });
});

// The catalogue import refuses what no screen can show, before writing anything, and says where: `row N.<field>`, N
// the file's line (the header is line 1). It used to store a currency '123', a price '1e3' as 1000 and '99.999' as 100,
// fares between airports nobody knows, a latitude of 999, a region 'Europe' (out of Home's carousels), a code 'Q1Z'
// (which then broke Popular and place photos) — or answer with raw SQL or a Zod array and no row.
describe("catalogue import — what it refuses, and where", () => {
  const until = () => new Date(Date.now() + 14 * 86_400_000).toISOString();
  const since = () => new Date(Date.now() - 86_400_000).toISOString();
  const FARES =
    "route_from,route_to,cabin,carrier,carrier_name,product,nonstop,duration_minutes,price,published_price,published_source,currency,valid_from,valid_until";
  const fare = (over: Partial<Record<string, string>> = {}) => {
    const v: Record<string, string> = {
      route_from: "JFK",
      route_to: "LHR",
      cabin: "business",
      carrier: "UA",
      carrier_name: "United",
      product: "Polaris",
      nonstop: "true",
      duration_minutes: "430",
      price: "4600.00",
      published_price: "8200.00",
      published_source: "Sabre · test",
      currency: "USD",
      valid_from: since(),
      valid_until: until(),
      ...over,
    };
    return FARES.split(",")
      .map((k) => v[k] ?? "")
      .join(",");
  };
  const AIRPORTS = "code,name,city,country,country_code,region,lat,lng,popularity,tz";
  const airport = (over: Partial<Record<string, string>> = {}) => {
    const v: Record<string, string> = {
      code: "LHR",
      name: "Heathrow",
      city: "London",
      country: "United Kingdom",
      country_code: "GB",
      region: "europe",
      lat: "51.47",
      lng: "-0.4543",
      popularity: "98",
      tz: "Europe/London",
      ...over,
    };
    return AIRPORTS.split(",")
      .map((k) => v[k] ?? "")
      .join(",");
  };

  it("refuses each bad value with 400 and the row's line and field; a good file still imports", async () => {
    const t = await testApp({ suite: "catalog-import-refuses" });
    await t.seedCatalogBasics();
    const importCsv = async (kind: "fares" | "airports", csv: string) => {
      const r = await t.app.request("/v1/internal/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
        body: JSON.stringify({ kind, csv }),
      });
      const body = (await r.json()) as { error?: { code?: string; details?: { path: string; message: string }[] } };
      return { status: r.status, code: body.error?.code, path: body.error?.details?.[0]?.path ?? null };
    };
    const refused = (path: string) => ({ status: 400, code: "VALIDATION", path });

    const fares: [string, Partial<Record<string, string>>, string][] = [
      ["currency 123", { currency: "123" }, "row 2.currency"],
      ["price 1e3", { price: "1e3" }, "row 2.price"],
      ["price 99.999", { price: "99.999" }, "row 2.price"],
      ["price 0", { price: "0", published_price: "", published_source: "" }, "row 2.price"],
      ["published price 1e4", { published_price: "1e4" }, "row 2.published_price"],
      ["published below the price", { published_price: "4000.00" }, "row 2.published_price"],
      ["a published price without its source", { published_source: "" }, "row 2.published_source"],
      ["route K1F", { route_from: "K1F", route_to: "BOS" }, "row 2.route_from"],
      ["an airport nobody knows", { route_to: "QQQ" }, "row 2.route_to"],
      ["a route to itself", { route_to: "JFK" }, "row 2.route_to"],
      ["a sale that ends before it starts", { valid_until: since(), valid_from: until() }, "row 2.valid_until"],
      ["a cabin in capitals", { cabin: "Business" }, "row 2.cabin"],
    ];
    for (const [name, over, path] of fares) {
      expect({ name, ...(await importCsv("fares", [FARES, fare(over)].join("\n"))) }).toEqual({
        name,
        ...refused(path),
      });
    }
    // The second data row is line 3; a header plus a blank line moves it on.
    expect(await importCsv("fares", [FARES, fare(), fare({ currency: "1$D" })].join("\n"))).toEqual(
      refused("row 3.currency"),
    );
    expect(await importCsv("fares", [FARES, "", fare({ price: "abc" })].join("\n"))).toEqual(refused("row 3.price"));

    const airports: [string, Partial<Record<string, string>>, string][] = [
      ["lat 999", { lat: "999" }, "row 2.lat"],
      ["lng 500", { lng: "500" }, "row 2.lng"],
      ["code Q1Z", { code: "Q1Z" }, "row 2.code"],
      ["popularity -5", { popularity: "-5" }, "row 2.popularity"],
      ["region Europe", { region: "Europe" }, "row 2.region"],
      ["a region Home has no carousel key for", { region: "atlantis" }, "row 2.region"],
      ["a country code of three letters", { country_code: "GBR" }, "row 2.country_code"],
      ["a time zone that is none", { tz: "Europe/Lndon" }, "row 2.tz"],
      ["no city", { city: "" }, "row 2.city"],
    ];
    for (const [name, over, path] of airports) {
      expect({ name, ...(await importCsv("airports", [AIRPORTS, airport(over)].join("\n"))) }).toEqual({
        name,
        ...refused(path),
      });
    }
    // Nothing of a refused file was written.
    const lhr = (await t.db.execute(
      sql`SELECT lat::text, region FROM catalog.airports WHERE code = 'LHR'`,
    )) as unknown as { lat: string; region: string }[];
    expect(lhr[0]).toEqual({ lat: "51.470000", region: "europe" });

    // Good files still import: an empty carrier name or product is none (the airline's code stands in for its name),
    // a lower-case currency is upper-cased, an empty currency is USD, an empty popularity is 0.
    expect(
      (await importCsv("fares", [FARES, fare({ carrier_name: "", product: "", currency: "usd" })].join("\n"))).status,
    ).toBe(200);
    expect(
      (await importCsv("fares", [FARES, fare({ carrier: "DL", carrier_name: "Delta", currency: "" })].join("\n")))
        .status,
    ).toBe(200);
    const search = (await (
      await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business", { headers: { Cookie: t.memberA.cookie } })
    ).json()) as {
      items: { carrier: { code: string; name: string }; product: string | null; price: { currency: string } }[];
    };
    expect(search.items.find((i) => i.carrier.code === "UA")).toMatchObject({
      carrier: { code: "UA", name: "UA" },
      product: null,
      price: { currency: "USD" },
    });
    expect(search.items.find((i) => i.carrier.code === "DL")?.price.currency).toBe("USD");
    expect((await importCsv("airports", [AIRPORTS, airport({ popularity: "" })].join("\n"))).status).toBe(200);
    await t.close();
  }, 60_000);

  it("names at most twenty rows, and a row the database refuses", async () => {
    const t = await testApp({ suite: "catalog-import-rows" });
    await t.seedCatalogBasics();
    const post = async (csv: string) => {
      const r = await t.app.request("/v1/internal/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
        body: JSON.stringify({ kind: "fares", csv }),
      });
      return {
        status: r.status,
        body: (await r.json()) as { error?: { message?: string; details?: { path: string; message: string }[] } },
      };
    };
    const many = await post([FARES, ...Array.from({ length: 25 }, () => fare({ currency: "1" }))].join("\n"));
    expect(many.status).toBe(400);
    expect(many.body.error?.details?.length).toBe(20);
    expect(many.body.error?.details?.[19]?.path).toBe("row 21.currency");

    // A rule only the database holds: the row is named, never the query or its values.
    await t.db.execute(sql`ALTER TABLE catalog.fares ADD CONSTRAINT fares_test_no_zz CHECK (carrier <> 'ZZ')`);
    try {
      const refused = await post([FARES, fare(), fare({ carrier: "ZZ", carrier_name: "Zed" })].join("\n"));
      expect(refused.status).toBe(400);
      expect(refused.body.error?.details?.[0]?.path).toBe("row 3");
      expect(refused.body.error?.details?.[0]?.message).toContain("fares_test_no_zz");
      expect(JSON.stringify(refused.body)).not.toContain("Failed query");
      expect(JSON.stringify(refused.body)).not.toContain("Zed");
    } finally {
      await t.db.execute(sql`ALTER TABLE catalog.fares DROP CONSTRAINT fares_test_no_zz`);
    }
    // The first row went with the second: nothing of the file is written.
    const ua = (await t.db.execute(
      sql`SELECT count(*)::int AS n FROM catalog.fares WHERE carrier = 'UA'`,
    )) as unknown as { n: number }[];
    expect(ua[0]?.n).toBe(0);
    await t.close();
  }, 60_000);
});

describe("GET /v1/home", () => {
  it("returns home + destinations + sections", async () => {
    const t = await testApp({ suite: "catalog-home" });
    await t.seedCatalogBasics();
    await t.seedBroadcastOffer({ routeFrom: "JFK", routeTo: "LHR", title: "London calling" });
    const r = await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("private, no-cache");
    const body = HomeVM.parse(await r.json());
    expect(body.home?.code).toBe("JFK");
    expect(body.destinations.some((d) => d.code === "LHR")).toBe(true);
    expect(body.destinations.find((d) => d.code === "LHR")?.hasOffer).toBe(true);
    expect(body.sections.length).toBeGreaterThan(0);
    await t.close();
  });

  it("loads home and offer airports in one getAirports call", async () => {
    const t = await testApp({ suite: "catalog-home-batch" });
    await t.seedCatalogBasics();
    await t.seedBroadcastOffer({ routeTo: "CDG", title: "Paris" });
    await t.seedBroadcastOffer({ routeTo: "HND", title: "Tokyo" });
    await t.seedBroadcastOffer({ routeTo: "DXB", title: "Dubai" });
    const catalog = t.registry.facade<CatalogFacade>("catalog");
    let many = 0;
    let one = 0;
    const getAirports = catalog.getAirports.bind(catalog);
    const getAirport = catalog.getAirport.bind(catalog);
    catalog.getAirports = async (...args) => {
      many++;
      return getAirports(...args);
    };
    catalog.getAirport = async (...args) => {
      one++;
      return getAirport(...args);
    };
    const r = await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    expect(many).toBe(1);
    expect(one).toBe(0);
    const body = HomeVM.parse(await r.json());
    expect(body.home?.code).toBe("JFK");
    await t.close();
  });

  it("names the cities of the offers no pin lists, so their cards never print a title cut short (ADR-IMPL-057)", async () => {
    const t = await testApp({ suite: "catalog-home-places" });
    await t.seedCatalogBasics();
    await t.seedBroadcastOffer({ routeTo: "LHR", title: "London calling" });
    // Rome has no fare from JFK in the basics: no pin names it.
    await t.seedBroadcastOffer({ routeTo: "FCO", title: "Easter in Rome" });
    const r = await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = HomeVM.parse(await r.json());
    const listed = new Set(body.destinations.map((d) => d.code));
    expect(listed.has("FCO")).toBe(false);
    expect(body.places).toContainEqual({ code: "FCO", city: "Rome", countryCode: "IT" });
    // Every offer's arrival is named once: by a pin, or by a place.
    for (const code of ["LHR", "FCO"]) {
      const named = listed.has(code) || (body.places ?? []).some((p) => p.code === code);
      expect(named).toBe(true);
    }
    for (const p of body.places ?? []) {
      expect(listed.has(p.code)).toBe(false);
      expect(p.city.length).toBeGreaterThan(0);
      expect(p.countryCode).toMatch(/^[A-Z]{2}$/);
    }
    await t.close();
  });

  it("titles the regions as Figma 89:389 does: To Europe … To North America, which leaves Brazil out", async () => {
    const t = await testApp({ suite: "catalog-home-regions" });
    await t.seedCatalogBasics();
    await t.db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng, popularity) VALUES
        ('YVR', 'Vancouver International', 'Vancouver', 'Canada', 'CA', 'americas', 49.1967, -123.1815, 80),
        ('GRU', 'Guarulhos', 'São Paulo', 'Brazil', 'BR', 'americas', -23.4356, -46.4731, 70)
      ON CONFLICT (code) DO NOTHING`);
    for (const [routeTo, title] of [
      ["LHR", "London"],
      ["HND", "Tokyo"],
      ["DXB", "Dubai"],
      ["YVR", "Vancouver"],
      ["GRU", "São Paulo"],
    ]) {
      await t.seedBroadcastOffer({ routeTo, title });
    }
    const r = await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = HomeVM.parse(await r.json());
    expect(body.sections.map((s) => [s.key, s.title])).toEqual([
      ["inspire", "Inspiration"],
      ["europe", "To Europe"],
      ["asia", "To Asia"],
      ["middle_east", "To the Middle East"],
      ["north_america", "To North America"],
    ]);
    expect(body.sections.find((s) => s.key === "north_america")?.items.map((i) => i.route.to)).toEqual(["YVR"]);

    // The carousels are in the ETag: Brazil corrected into North America moves São Paulo's offer in, with the same
    // offers in the same states — the tag changes and the app is not left on its 304.
    const etag = r.headers.get("ETag")!;
    expect(
      (await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie, "If-None-Match": etag } })).status,
    ).toBe(304);
    await t.db.execute(sql`UPDATE catalog.airports SET country_code = 'MX' WHERE code = 'GRU'`);
    const moved = await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie, "If-None-Match": etag } });
    expect(moved.status).toBe(200);
    expect(
      HomeVM.parse(await moved.json())
        .sections.find((s) => s.key === "north_america")
        ?.items.map((i) => i.route.to)
        .sort(),
    ).toEqual(["GRU", "YVR"]);
    await t.close();
  });
});

// A member's Home and feed are revalidated on every request and never reused for another session on the same device:
// iOS's shared URL cache keys on the URL, not on the cookie, and served member A's Home to member B for five minutes.
describe("GET /v1/home and /v1/proposals — HTTP caching", () => {
  it("answers no-cache with Vary: Cookie, Authorization, on the 200 and on the 304", async () => {
    const t = await testApp({ suite: "catalog-home-vary" });
    await t.seedCatalogBasics();
    await t.seedBroadcastOffer({ routeTo: "LHR", title: "London calling" });
    const perMember = (r: Response) => {
      const cacheControl = r.headers.get("Cache-Control") ?? "";
      const vary = (r.headers.get("Vary") ?? "").split(",").map((v) => v.trim().toLowerCase());
      return {
        noCache: cacheControl.includes("no-cache"),
        maxAge: cacheControl.includes("max-age"),
        cookie: vary.includes("cookie"),
        authorization: vary.includes("authorization"),
      };
    };
    const expected = { noCache: true, maxAge: false, cookie: true, authorization: true };
    for (const path of ["/v1/home", "/v1/proposals"]) {
      const first = await t.app.request(path, { headers: { Cookie: t.memberA.cookie } });
      expect(first.status).toBe(200);
      expect({ path, ...perMember(first) }).toEqual({ path, ...expected });
      const etag = first.headers.get("ETag")!;
      const again = await t.app.request(path, { headers: { Cookie: t.memberA.cookie, "If-None-Match": etag } });
      expect(again.status).toBe(304);
      expect({ path, ...perMember(again) }).toEqual({ path, ...expected });
      expect(again.headers.get("ETag")).toBe(etag);
    }
    await t.close();
  });
});

// The ETag is the body's: whatever Home shows changes it. If-None-Match is read as RFC 9110 reads it — a list of tags,
// compared weakly, or `*`.
describe("GET /v1/home — ETag", () => {
  it("follows a pin's city, name and coordinates; matches W/, a list and *", async () => {
    const t = await testApp({ suite: "catalog-home-etag" });
    await t.seedCatalogBasics();
    const home = (ifNoneMatch?: string) =>
      t.app.request("/v1/home", {
        headers: { Cookie: t.memberA.cookie, ...(ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {}) },
      });
    const first = await home();
    expect(first.status).toBe(200);
    const etag = first.headers.get("ETag")!;
    expect((await home(etag)).status).toBe(304);
    expect((await home(`W/${etag}`)).status).toBe(304);
    expect((await home(`"x", ${etag}`)).status).toBe(304);
    expect((await home(`"x",W/${etag}`)).status).toBe(304);
    expect((await home("*")).status).toBe(304);
    expect((await home(`"x"`)).status).toBe(200);

    // London's airport renamed and moved by an airports import: a pin's city, name and place are a new body.
    const imported = await t.app.request("/v1/internal/catalog/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
      body: JSON.stringify({
        kind: "airports",
        csv: [
          "code,name,city,country,country_code,region,lat,lng,popularity,tz",
          "LHR,Heathrow Airport,Greater London,United Kingdom,GB,europe,51.4700,-0.4600,98,Europe/London",
        ].join("\n"),
      }),
    });
    expect(imported.status).toBe(200);
    const renamed = await home(etag);
    expect(renamed.status).toBe(200);
    expect(renamed.headers.get("ETag")).not.toBe(etag);
    const lhr = HomeVM.parse(await renamed.json()).destinations.find((d) => d.code === "LHR");
    expect(lhr).toMatchObject({ city: "Greater London", name: "Heathrow Airport" });
    await t.close();
  });
});

// ADR-IMPL-045: the site's cities as pins after the fares', priced by the formula in the member's cabin — so the pin,
// the estimate row its search shows and the quote show one number — and a pin's price in the ETag.
describe("GET /v1/home — the site's pins", () => {
  it("after the fares' pins, priced as their searches are, in the member's cabin; the ETag follows the prices", async () => {
    const t = await testApp({ suite: "catalog-home-site" });
    await t.seedCatalogBasics();
    await t.db.execute(sql`
      INSERT INTO catalog.site_places (cms_id, name, country, region, airport, airports, promoted, image) VALUES
        (23, 'London', 'United Kingdom', 'Europe', 'LHR', ARRAY['LHR'], false, 'bestDeals/23/image/l.jpg'),
        (8, 'Paris', 'France', 'Europe', 'CDG', ARRAY['CDG'], false, NULL),
        (283, 'Tokyo', 'Japan', 'Asia', 'HND', ARRAY['HND'], true, NULL),
        (512, 'Dubai', 'United Arab Emirates', 'Middle East', 'DXB', ARRAY['DXB'], false, NULL),
        (92, 'Rome', 'Italy', 'Europe', 'FCO', ARRAY['FCO', 'CIA'], false, NULL),
        (1201, 'Zurich', 'Switzerland', 'Europe', 'ZRH', ARRAY['ZRH'], false, NULL)`);
    await t.db.execute(sql`
      INSERT INTO catalog.site_routes (route_from, cms_id, deal, price, published_price) VALUES
        ('JFK', 23, 54, 788, 2288), ('JFK', 8, 168, 872, 2319), ('JFK', 283, 1508, 1745, 1865),
        ('JFK', 512, 1, 1365, NULL), ('JFK', 92, 2, 950, NULL), ('JFK', 1201, 3, 990, NULL)`);
    await t.flags.set("catalog.site_pins", { enabled: true });
    await t.flags.set("catalog.estimates", { enabled: true });
    await t.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));

    const home = async () => {
      const r = await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie } });
      expect(r.status).toBe(200);
      return { body: HomeVM.parse(await r.json()), etag: r.headers.get("ETag") };
    };
    const search = async (to: string, cabin: "business" | "first") => {
      const r = await t.app.request(`/v1/search?from=JFK&to=${to}&cabin=${cabin}`, {
        headers: { Cookie: t.memberA.cookie },
      });
      return ((await r.json()) as { estimate: { amount: number } | null }).estimate?.amount ?? null;
    };

    const business = await home();
    // Paris and London have fares: their fare pins, no site pins. Tokyo (on the site's home page) first, then by
    // traffic; each site pin's price is the estimate its search shows.
    const codes = business.body.destinations.map((d) => d.code);
    expect(codes.slice(0, 3)).toEqual(["CDG", "LHR", "HND"]);
    expect(codes.slice(3).sort()).toEqual(["DXB", "FCO", "ZRH"]);
    expect(business.body.destinations[1]).toMatchObject({ fromPrice: 4200 });
    for (const d of business.body.destinations.slice(2)) {
      expect(d.fromPrice).toBe((await search(d.code, "business"))!);
      expect(d.hasOffer).toBe(false);
    }

    // The same pins, other prices (new rules): a new ETag.
    const dearer: typeof FIXTURE_RULES = {
      ...FIXTURE_RULES,
      continents_pair: Object.fromEntries(
        Object.entries(FIXTURE_RULES.continents_pair).map(([pair, v]) => [
          pair,
          { ...v, round_trip: { ...v.round_trip, business: v.round_trip.business + 100 } },
        ]),
      ) as typeof FIXTURE_RULES.continents_pair,
    };
    await t.flags.set("catalog.pricing_rules", storedPricingRules(dearer));
    const repriced = await home();
    expect(repriced.body.destinations.map((d) => d.code)).toEqual(codes);
    expect(repriced.body.destinations[2]!.fromPrice).toBe(business.body.destinations[2]!.fromPrice + 100);
    expect(repriced.etag).not.toBe(business.etag);

    // First class (the member's Profile): Europe's pins at the formula's first-class price; Asia's has none, no pin.
    const prefs = await t.app.request("/v1/profile/travel", {
      method: "PUT",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ cabin: "first" }),
    });
    expect(prefs.status).toBeLessThan(300);
    const first = await home();
    const firstSite = first.body.destinations.slice(2);
    expect(firstSite.map((d) => d.code).sort()).toEqual(["FCO", "ZRH"]);
    for (const d of firstSite) expect(d.fromPrice).toBe((await search(d.code, "first"))!);
    await t.close();
  });
});

describe("fare parity", () => {
  it("fixture fare round-trips through toFareVM", () => {
    const f = fixture.fares[0]!;
    const now = new Date();
    const vm = toFareVM(
      {
        id: f.id,
        routeFrom: f.from.code,
        routeTo: f.to.code,
        cabin: f.cabin,
        carrier: f.carrier.code,
        carrierName: f.carrier.name,
        product: f.product,
        nonstop: f.nonstop,
        durationMinutes: f.durationMinutes,
        departAt: f.departAt ? new Date(f.departAt) : null,
        arriveAt: f.arriveAt ? new Date(f.arriveAt) : null,
        price: String(f.price.offer),
        publishedPrice: f.price.published != null ? String(f.price.published) : null,
        publishedSource: f.price.publishedSource ?? null,
        currency: f.price.currency,
        trip: "one_way",
        source: "manual",
        validFrom: now,
        validUntil: new Date(f.validUntil),
        published: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        from: {
          code: f.from.code,
          city: f.from.city,
          name: "JFK",
          country: "United States",
          countryCode: "US",
          region: "north_america",
          lat: "0",
          lng: "0",
          popularity: 0,
          tz: "America/New_York",
          searchTerms: null,
          description: null,
          createdAt: now,
        },
        to: {
          code: f.to.code,
          city: f.to.city,
          name: "LHR",
          country: "United Kingdom",
          countryCode: "GB",
          region: "europe",
          lat: "0",
          lng: "0",
          popularity: 0,
          tz: "Europe/London",
          searchTerms: null,
          description: null,
          createdAt: now,
        },
      },
      f.hasOffer,
    );
    expect(FareVM.parse(vm).price.offer).toBe(f.price.offer);
    expect(vm.carrier.code).toBe("BA");
    expect(vm.offerId).toBeNull();
    expect(vm.departLocal).toBe("18:55");
    expect(vm.arriveLocal).toBe("07:00");
    expect(vm.arriveDayOffset).toBe(1);
    expect(vm.departDate).toBe("2026-10-12");
  });
});
