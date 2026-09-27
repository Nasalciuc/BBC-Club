import { describe, expect, it } from "bun:test";
import { shouldAskForPush } from "./push-ask-logic";

describe("shouldAskForPush", () => {
  it("asks once, only while the system has never asked", () => {
    expect(shouldAskForPush("undetermined", null)).toBe(true);
    expect(shouldAskForPush("granted", null)).toBe(false);
    expect(shouldAskForPush("denied", null)).toBe(false);
    expect(shouldAskForPush("undetermined", 1_700_000_000_000)).toBe(false);
  });
});
