import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";

import { knownCarrier, withKnownCarrier } from "./known-carrier";

const fare = fixture.fares[0]!;

describe("a fare that names no airline (F018)", () => {
  it("is no airline: the catalogue's `Unknown` and a blank name alike; a name without a code is an airline", () => {
    expect(knownCarrier({ code: null, name: "Unknown" })).toBeNull();
    expect(knownCarrier({ code: null, name: "  " })).toBeNull();
    expect(knownCarrier({ code: null, name: "La Compagnie" })).toEqual({ code: null, name: "La Compagnie" });
    expect(knownCarrier(fare.carrier)).toBe(fare.carrier);
  });

  it("prints no name in a card — the flight options and the fare's overview never say `Unknown`", () => {
    const unknown = { ...fare, carrier: { code: null, name: "Unknown", logoUrl: null } };
    expect(withKnownCarrier(unknown).carrier).toEqual({ code: null, name: "", logoUrl: null });
    expect(withKnownCarrier(unknown).price).toBe(unknown.price);
    // A fare with its airline is left as it is.
    expect(withKnownCarrier(fare)).toBe(fare);
  });
});
