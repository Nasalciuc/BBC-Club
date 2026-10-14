import { describe, expect, it } from "bun:test";

import { parseFareGoneContext } from "./fare-gone";

const base = { price: 4200, currency: "USD", validUntil: "2026-10-01T00:00:00.000Z", from: "JFK", to: "LHR" };

describe("parseFareGoneContext", () => {
  it("reads what closed, as a server that names it sends it", () => {
    expect(
      parseFareGoneContext({
        ...base,
        fromCity: "New York",
        toCity: "London",
        carrier: "British Airways",
        cabin: "business",
        departDate: "2026-10-12",
      }),
    ).toEqual({
      ...base,
      fromCity: "New York",
      toCity: "London",
      carrier: "British Airways",
      cabin: "business",
      departDate: "2026-10-12",
    });
  });

  it("keeps an older server's codes and leaves the rest unknown", () => {
    expect(parseFareGoneContext(base)).toEqual({
      ...base,
      fromCity: null,
      toCity: null,
      carrier: null,
      cabin: null,
      departDate: null,
    });
  });

  it("refuses a context without the route, and a day it cannot read", () => {
    expect(parseFareGoneContext({ ...base, from: undefined })).toBeUndefined();
    expect(parseFareGoneContext({ ...base, departDate: "12 Oct" })?.departDate).toBeNull();
  });
});
