/** What a request's body may say (packages/shared RequestBody): a trip that can be flown. The day it is on is checked
 *  by the server alone (SubmittedRequestBody): a request kept on the phone must stay readable after its day. */
import { describe, expect, it } from "bun:test";
import { RequestBody, SubmittedRequestBody, earliestLegDay } from "@bbc/shared/api/v1/requests";
import { DEPART } from "../days";

const base = {
  tripType: "oneway",
  cabin: "business",
  legs: [{ from: "JFK", to: "LHR", date: "2027-10-12" }],
  passengers: { adult: 1, child: 0, infant: 0 },
  contact: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
};

describe("earliestLegDay", () => {
  it("is yesterday in UTC: today, or later, somewhere every member may be", () => {
    expect(earliestLegDay(new Date("2026-10-22T00:30:00Z"))).toBe("2026-10-21");
    expect(earliestLegDay(new Date("2026-10-22T23:59:00Z"))).toBe("2026-10-21");
    expect(earliestLegDay(new Date("2026-03-01T12:00:00Z"))).toBe("2026-02-28");
  });
});

describe("a past day", () => {
  it("still reads as a RequestBody (the offline queue parses it), and the server refuses it", () => {
    const past = { ...base, legs: [{ from: "JFK", to: "LHR", date: "2020-01-01" }] };
    expect(RequestBody.safeParse(past).success).toBe(true);
    const refused = SubmittedRequestBody.safeParse(past);
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.error.issues.map((i) => i.path.join("."))).toEqual(["legs.0.date"]);
    expect(SubmittedRequestBody.safeParse({ ...base, legs: [{ from: "JFK", to: "LHR", date: DEPART }] }).success).toBe(
      true,
    );
  });
});

describe("a trip that can be flown", () => {
  const issues = (over: Record<string, unknown>) => {
    const r = RequestBody.safeParse({ ...base, ...over });
    return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
  };

  it("a round trip is there and back; one way is one flight; multi-city two to six", () => {
    const there = { from: "JFK", to: "LHR", date: "2027-10-12" };
    expect(issues({ tripType: "round", legs: [there, { from: "LHR", to: "JFK", date: "2027-10-19" }] })).toEqual([]);
    expect(issues({ tripType: "round", legs: [there] })).toEqual(["legs"]);
    expect(issues({ tripType: "round", legs: [there, { from: "LHR", to: "CDG", date: "2027-10-19" }] })).toEqual([
      "legs.1",
    ]);
    expect(issues({ legs: [there, { from: "LHR", to: "JFK", date: "2027-10-19" }] })).toEqual(["legs"]);
    expect(issues({ tripType: "multi", legs: [there] })).toEqual(["legs"]);
  });

  it("each leg goes somewhere, on or after the one before", () => {
    expect(issues({ legs: [{ from: "JFK", to: "JFK", date: "2027-10-12" }] })).toEqual(["legs.0.to"]);
    expect(
      issues({
        tripType: "multi",
        legs: [
          { from: "JFK", to: "LHR", date: "2027-10-12" },
          { from: "LHR", to: "CDG", date: "2027-10-12" },
          { from: "CDG", to: "JFK", date: "2027-10-11" },
        ],
      }),
    ).toEqual(["legs.2.date"]);
  });

  it("no more infants than adults, and no NUL in what the member typed", () => {
    expect(issues({ passengers: { adult: 1, child: 0, infant: 2 } })).toEqual(["passengers.infant"]);
    expect(issues({ passengers: { adult: 2, child: 0, infant: 2 } })).toEqual([]);
    expect(issues({ note: "Aisle\u0000please" })).toEqual(["note"]);
    expect(issues({ contact: { ...base.contact, name: "Alex\u0000" } })).toEqual(["contact.name"]);
  });
});
