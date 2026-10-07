import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";
import { FareVM, AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";
import { toFareVM, type CatalogFacade } from "@bbc/catalog";
import { fixture } from "@bbc/shared/fixture";

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
    expect((await codes("lo")).length).toBeLessThanOrEqual(8);
    expect(await codes("%")).toEqual([]); // a wildcard character is matched literally, not as "anything"
    expect(await codes("_")).toEqual([]);
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

describe("GET /v1/home", () => {
  it("returns home + destinations + sections", async () => {
    const t = await testApp({ suite: "catalog-home" });
    await t.seedCatalogBasics();
    await t.seedBroadcastOffer({ routeFrom: "JFK", routeTo: "LHR", title: "London calling" });
    const r = await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toContain("max-age=300");
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
  });
});
