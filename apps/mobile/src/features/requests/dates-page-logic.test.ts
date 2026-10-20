import { describe, expect, it } from "bun:test";

import { datesEyebrow } from "./dates-page-logic";

describe("the dates page's line over its title (07)", () => {
  it("names the trip by its cities", () => {
    expect(datesEyebrow("New York", "London")).toBe("NEW YORK TO LONDON");
  });

  it("names the destination alone when the origin is not known, and nothing without either", () => {
    expect(datesEyebrow(null, "London")).toBe("TO LONDON");
    expect(datesEyebrow(" ", undefined)).toBe("");
    expect(datesEyebrow(undefined, undefined)).toBe("");
  });
});
