import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";
import { fareFacts } from "./fare-facts";

describe("fareFacts", () => {
  it("includes times when departAt and arriveAt are set", () => {
    const facts = fareFacts(fixture.fares[0]!);
    expect(facts).toMatch(/\d{2}:\d{2} — \d{2}:\d{2}/);
    expect(facts).toContain("H");
  });

  it("does not invent times when departAt is null", () => {
    const facts = fareFacts(fixture.fares[2]!);
    expect(facts).not.toMatch(/\d{2}:\d{2}/);
    expect(facts).toContain("NONSTOP");
  });
});
