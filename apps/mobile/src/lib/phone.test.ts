import { describe, it, expect } from "bun:test";
import { callingCodeLabel, defaultPhoneCountry, splitStoredPhone, validatePhone } from "./phone";

describe("validatePhone", () => {
  it("accepts E.164 and US national for the fixture number", () => {
    expect(validatePhone("+12125550148").e164).toBe("+12125550148");
    expect(validatePhone("2125550148", "US").e164).toBe("+12125550148");
  });

  it("accepts a valid Moldova national number with MD", () => {
    const r = validatePhone("69123456", "MD");
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.e164).toBe("+37369123456");
  });

  it("rejects the screenshot digit string under US (regression)", () => {
    const r = validatePhone("154668456877", "US");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toBe("That phone number doesn't look right.");
  });

  it("rejects too-short input", () => {
    const r = validatePhone("123", "US");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toContain("phone number");
  });
});

describe("defaultPhoneCountry", () => {
  it("maps locale tags to club countries", () => {
    expect(defaultPhoneCountry("ro-MD")).toBe("MD");
    expect(defaultPhoneCountry("ro-RO")).toBe("RO");
    expect(defaultPhoneCountry("en-GB")).toBe("GB");
    expect(defaultPhoneCountry("en-US")).toBe("US");
  });
});

describe("phone rules on 173:3619", () => {
  it("empty or short national numbers ask for a number", () => {
    const r = validatePhone("", "US");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toBe("Enter a phone number so we can call you.");
  });

  it("a short plus-prefixed string asks for a number", () => {
    const r = validatePhone("+12", "US");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toBe("Enter a phone number so we can call you.");
  });

  it("an invalid national string is rejected after submit", () => {
    const r = validatePhone("0000000", "US");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toBe("That phone number doesn't look right.");
  });

  it("a leading plus ignores the default country", () => {
    expect(validatePhone("+447911123456", "US").e164).toBe("+447911123456");
  });
});

describe("splitStoredPhone / callingCodeLabel", () => {
  it("splits E.164 into country + national", () => {
    expect(splitStoredPhone("+12125550148")).toEqual({ country: "US", national: "2125550148" });
    expect(splitStoredPhone("+37369123456")).toEqual({ country: "MD", national: "69123456" });
  });

  it("labels calling codes", () => {
    expect(callingCodeLabel("US")).toBe("+1");
    expect(callingCodeLabel("MD")).toBe("+373");
  });
});
