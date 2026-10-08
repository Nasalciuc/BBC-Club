/** The staging demo's guard and plan (ADR-IMPL-040) — no database. */
import { describe, expect, it } from "bun:test";

import { fixture } from "@bbc/shared/fixture";
import { DEMO, assertStagingTarget, atLocal, demoPlan } from "./seed-staging-demo";

const member = { id: "member-1", email: "review@example.test" };
const PRODUCTION_ORIGIN = "https://api.buybusinessclass.com";
const STAGING_ORIGIN = "https://api-staging.buybusinessclass.com";

describe("assertStagingTarget — never production's database", () => {
  const prod = (host: string) => ({
    NODE_ENV: "production",
    DATABASE_URL: `postgres://bbc:x@${host}:5432/bbc`,
    APP_ORIGIN: PRODUCTION_ORIGIN,
  });

  it("accepts staging's hosts, whatever the mode", () => {
    expect(() => assertStagingTarget(prod("postgres-staging"))).not.toThrow();
    expect(() => assertStagingTarget({ ...prod("pgbouncer-staging"), APP_ORIGIN: STAGING_ORIGIN })).not.toThrow();
  });

  it("refuses production's hosts and anything else, in production mode", () => {
    for (const host of ["postgres", "pgbouncer", "db.example.com", "10.0.0.5"]) {
      expect(() => assertStagingTarget(prod(host))).toThrow(/refused/);
    }
  });

  it("accepts a local database only outside production mode and away from production's origin", () => {
    const local = (over: Partial<ReturnType<typeof prod>>) => ({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://bbc:x@localhost:5432/bbc",
      APP_ORIGIN: "http://localhost:8000",
      ...over,
    });
    expect(() => assertStagingTarget(local({}))).not.toThrow();
    expect(() =>
      assertStagingTarget(local({ DATABASE_URL: "postgres://bbc:x@127.0.0.1:55432/bbc_test" })),
    ).not.toThrow();
    expect(() => assertStagingTarget(local({ NODE_ENV: "production" }))).toThrow(/refused/);
    expect(() => assertStagingTarget(local({ APP_ORIGIN: PRODUCTION_ORIGIN }))).toThrow(/refused/);
  });
});

describe("atLocal — the same wall clock across daylight saving", () => {
  it("18:55 in New York is 22:55Z in summer and 23:55Z in winter", () => {
    expect(atLocal(new Date("2026-07-10T00:00:00Z"), "18:55", "America/New_York").toISOString()).toBe(
      "2026-07-10T22:55:00.000Z",
    );
    expect(atLocal(new Date("2026-12-10T00:00:00Z"), "18:55", "America/New_York").toISOString()).toBe(
      "2026-12-10T23:55:00.000Z",
    );
  });
});

describe("demoPlan — Figma's situations, dated from today", () => {
  const now = new Date("2026-12-15T10:30:00Z");
  const plan = demoPlan(member, now);

  it("every departure, validity and trip lies ahead of today; every publication and request behind it", () => {
    for (const f of plan.fares) {
      expect(f.validUntil.getTime()).toBeGreaterThan(now.getTime());
      if (f.departAt) {
        expect(f.departAt.getTime()).toBeGreaterThan(now.getTime());
        expect(f.validUntil.getTime()).toBeLessThan(f.departAt.getTime());
        expect(f.arriveAt?.getTime()).toBe(f.departAt.getTime() + f.durationMinutes * 60_000);
      }
    }
    for (const { row } of plan.offers) {
      expect(row.publishAt.getTime()).toBeLessThan(now.getTime());
      expect(row.validUntil.getTime()).toBeGreaterThan(now.getTime());
    }
    for (const { row, events } of plan.requests) {
      expect(row.createdAt.getTime()).toBeLessThan(now.getTime());
      expect(row.legs[0]!.date > "2026-12-15").toBe(true);
      expect(row.legs[1]!.date > row.legs[0]!.date).toBe(true);
      for (const e of events) expect(e.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("the fixture's six fares on five pins, the three offers, three requests — one in each state the server keeps", () => {
    expect(plan.fares.length).toBe(6);
    expect([...new Set(plan.fares.map((f) => f.routeTo))].sort()).toEqual(["CDG", "DXB", "HND", "LHR", "SIN"]);
    expect(plan.fares.map((f) => f.routeTo)).not.toContain("ZRH"); // the poster route stays without a fare: the estimate
    expect(plan.fares.map((f) => f.id)).not.toContain("00000000-0000-4000-8000-00000000fa07"); // the closed fare
    expect(plan.offers.map((o) => o.key).sort()).toEqual(["london", "paris", "tokyo"]);
    expect(plan.requests.map((r) => r.row.status).sort()).toEqual(["booked", "quoted", "received"]);
    expect(plan.requests.every((r) => r.row.sentToCrm && r.row.crmRequestId?.startsWith("staging-demo-"))).toBe(true);
  });

  it("the London offer names the month the flight leaves — in December, 'Your January in London'", () => {
    const london = plan.offers.find((o) => o.key === "london")!;
    expect(london.row.title).toBe("Your January in London");
    expect(london.row.targetMemberId).toBe(member.id);
    expect(london.row.idempotencyKey).toBe(DEMO.offerKey("london"));
    const ba = plan.fares.find((f) => f.id === "00000000-0000-4000-8000-00000000fa01")!;
    expect(ba.departAt?.toISOString()).toBe("2027-01-05T23:55:00.000Z"); // 18:55 New York, 21 days on
  });

  it("the fixture's own prices and routes — nothing invented", () => {
    for (const f of plan.fares) {
      const src = fixture.fares.find((x) => x.id === f.id)!;
      expect([f.routeFrom, f.routeTo, f.price]).toEqual([src.from.code, src.to.code, String(src.price.offer)]);
    }
    for (const { key, row } of plan.offers) {
      const src = fixture.offers.find((o) => o.key === key)!;
      expect([row.routeTo, row.price, row.publishedPrice]).toEqual([src.to, String(src.price), String(src.published)]);
    }
    for (const { row } of plan.requests) {
      expect(row.contactEmail).toBe(member.email);
      expect(row.passengers).toEqual(fixture.requests.find((r) => r.id === row.id)!.passengers);
    }
  });

  it("is a pure function of the clock", () => {
    expect(demoPlan(member, now)).toEqual(plan);
    const later = demoPlan(member, new Date("2027-03-01T00:00:00Z"));
    expect(later.offers.find((o) => o.key === "london")!.row.title).toBe("Your March in London");
  });
});
