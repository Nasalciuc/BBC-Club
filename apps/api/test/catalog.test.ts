import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";
import { FareVM, AirportVM, HomeVM } from "@bbc/shared/api/v1/fares";
import { toFareVM } from "../src/presentation/mobile/view-models";
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
});

describe("fare parity", () => {
  it("fixture fare round-trips through toFareVM", () => {
    const f = fixture.fares[0]!;
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
        validUntil: new Date(f.validUntil),
      },
      {
        from: { code: f.from.code, city: f.from.city, name: "JFK", countryCode: "US", lat: 0, lng: 0 },
        to: { code: f.to.code, city: f.to.city, name: "LHR", countryCode: "GB", lat: 0, lng: 0 },
      },
      f.hasOffer,
    );
    expect(FareVM.parse(vm).price.offer).toBe(f.price.offer);
    expect(vm.carrier.code).toBe("BA");
  });
});
