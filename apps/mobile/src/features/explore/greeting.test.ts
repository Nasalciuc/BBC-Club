import { describe, expect, it } from "bun:test";

import { firstName, greetingFor } from "./greeting";

describe("greetingFor", () => {
  it("says morning from 5 to noon, afternoon to 6 pm, evening otherwise", () => {
    expect(greetingFor(5)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good evening");
  });
});

describe("firstName", () => {
  it("takes the first word of the member's name", () => {
    expect(firstName("Alex Morgan")).toBe("Alex");
    expect(firstName("  Daniel ")).toBe("Daniel");
  });

  it("has none without a name", () => {
    expect(firstName("")).toBeNull();
    expect(firstName("   ")).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});
