import { test, expect } from "bun:test";
import { confirmationKind, retryMinutes, telHref } from "./confirmation-logic";
test("the confirmation follows the source; offline always wins", () => {
  expect(confirmationKind("offer", false)).toBe("offer");
  expect(confirmationKind("search", false)).toBe("search");
  expect(confirmationKind("search", true)).toBe("saved");
  expect(confirmationKind("offer", true)).toBe("saved");
});
test("retry minutes: whole minutes, at least one", () => {
  expect(retryMinutes(360)).toBe(6); // requests.submit: 1 h / 10 = 6 min
  expect(retryMinutes(61)).toBe(2);
  expect(retryMinutes(30)).toBe(1);
  expect(retryMinutes(0)).toBe(1);
  expect(retryMinutes(undefined)).toBe(1);
  expect(retryMinutes(Number.NaN)).toBe(1);
});
test("no verified number, no call button", () => {
  expect(telHref(undefined)).toBeNull();
  expect(telHref("")).toBeNull();
  expect(telHref("+1 (212) 555-0148")).toBe("tel:+12125550148");
  expect(telHref("123")).toBeNull();
});
