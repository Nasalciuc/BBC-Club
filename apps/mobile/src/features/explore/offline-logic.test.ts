import { describe, expect, it } from "bun:test";

import { isOffline } from "./offline-logic";

describe("isOffline", () => {
  it("is offline only when the platform says so — unknown is not offline", () => {
    expect(isOffline({ isConnected: false, isInternetReachable: null })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: false })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: true })).toBe(false);
    expect(isOffline({ isConnected: true, isInternetReachable: null })).toBe(false);
    expect(isOffline({ isConnected: null, isInternetReachable: null })).toBe(false);
  });
});
