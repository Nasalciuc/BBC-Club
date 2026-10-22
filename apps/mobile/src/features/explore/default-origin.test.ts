import { expect, test } from "bun:test";
import { DEFAULT_HOME_AIRPORT } from "@bbc/shared/defaults";
import { DEFAULT_ORIGIN } from "./default-origin";

test("the app starts a search where the BFF does when no airport is known (ADR-IMPL-013: one fallback)", () => {
  // A change to DEFAULT_HOME_AIRPORT fails here: describe the new airport in default-origin.ts too.
  expect(DEFAULT_ORIGIN.code).toBe(DEFAULT_HOME_AIRPORT);
});
