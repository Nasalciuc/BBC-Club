/** ADR-IMPL-042: a request names where it goes — the outbound leg (a round trip's last leg comes home) and the
 *  destination's city — in the member's list and detail, the quote-ready push and the operator's page; and the detail
 *  reads its trip type and the number the specialist calls. */
import { describe, expect, it } from "bun:test";
import { RequestVM } from "@bbc/shared/api/v1/requests";
import { signAction } from "../../../packages/modules/domain/requests/src/application/operator-links";
import { testApp } from "./helpers/test-app";

const SECRET = "ops-link-secret-at-least-32-characters";

describe("a request names its destination", () => {
  it("round trip JFK–LHR reads JFK → LHR and London everywhere, never JFK → JFK", async () => {
    const t = await testApp({ suite: "requests-route", env: { OPS_LINK_SECRET: SECRET } });
    await t.seedCatalogBasics();
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(created.status).toBe(201);
    const vm = RequestVM.parse(await created.json());
    expect(vm.route).toBe("JFK → LHR");
    expect(vm.city).toBe("London");
    // The detail's facts line and its `WE WILL CALL` (Figma 233:4171, 233:4242): the member's own number.
    expect(vm.tripType).toBe("round");
    expect(vm.phone).toBe("+12125550148");

    const cookie = { headers: { Cookie: t.memberA.cookie } };
    const list = (await (await t.app.request("/v1/requests", cookie)).json()) as { items: unknown[] };
    const item = RequestVM.parse(list.items[0]);
    expect(item.route).toBe("JFK → LHR");
    expect(item.city).toBe("London");
    const detail = RequestVM.parse(await (await t.app.request(`/v1/requests/${vm.id}`, cookie)).json());
    expect(detail.route).toBe("JFK → LHR");
    expect(detail.city).toBe("London");
    expect([detail.tripType, detail.phone]).toEqual(["round", "+12125550148"]);
    // One month is named once (Figma 233:4069: `OCT 12–19`).
    expect(detail.dates).toBe("Oct 12–19");

    // The operator's page and the status event the quote-ready push is written from.
    const html = await (await t.app.request(`/ops/requests/${signAction(SECRET, vm.id, "quoted")}`)).text();
    expect(html).toContain("JFK → LHR");
    expect(html).not.toContain("JFK → JFK");
    await t.drainAll();
    const status = await t.app.request(`/v1/internal/requests/${vm.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
      body: JSON.stringify({ status: "quoted" }),
    });
    expect(status.status).toBe(200);
    const changed = await t.journal.byType("request.status_changed");
    expect(changed.find((e) => e.payload.requestId === vm.id)?.payload.route).toBe("JFK → LHR");
    const submitted = await t.journal.byType("request.submitted");
    expect(submitted.find((e) => e.payload.requestId === vm.id)?.payload.route).toBe("JFK → LHR");
    await t.close();
  });

  it("one way names its leg; an airport the catalog does not know has no city", async () => {
    const t = await testApp({ suite: "requests-route-oneway" });
    await t.seedCatalogBasics();
    const oneWay = await t.submitRequestAs(
      t.memberA,
      t.sampleRequestBody({ tripType: "oneway", legs: [{ from: "JFK", to: "CDG", date: "2027-10-12" }] }),
      { idempotencyKey: crypto.randomUUID() },
    );
    expect(oneWay.status).toBe(201);
    expect(RequestVM.parse(await oneWay.json())).toMatchObject({
      route: "JFK → CDG",
      city: "Paris",
      tripType: "oneway",
    });

    const unknown = await t.submitRequestAs(
      t.memberA,
      t.sampleRequestBody({ tripType: "oneway", legs: [{ from: "JFK", to: "QQQ", date: "2027-10-12" }] }),
      { idempotencyKey: crypto.randomUUID() },
    );
    expect(unknown.status).toBe(201);
    expect(RequestVM.parse(await unknown.json())).toMatchObject({ route: "JFK → QQQ", city: null });
    await t.close();
  });

  it("an app built before the city, the trip type and the phone still parses the answer", () => {
    const older = RequestVM.omit({ city: true, tripType: true, phone: true }).strict();
    const answer = {
      id: "33333333-3333-4333-8333-333333333333",
      reference: "",
      route: "JFK → LHR",
      dates: "Oct 12–19",
      cabin: "business",
      passengers: { adult: 1, child: 0, infant: 0 },
      priceAtRequest: null,
      status: "received",
      createdAt: new Date().toISOString(),
      timeline: [],
    };
    expect(older.safeParse(answer).success).toBe(true);
    // An older app's schema strips unknown keys: the new fields never break it.
    const newer = { ...answer, city: "London", tripType: "round", phone: "+12125550148" };
    expect(RequestVM.omit({ city: true, tripType: true, phone: true }).safeParse(newer).success).toBe(true);
    // A newer app reads an older server: no city, still valid.
    expect(RequestVM.safeParse(answer).success).toBe(true);
  });
});
