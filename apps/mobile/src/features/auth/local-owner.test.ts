/** What the phone keeps for one member — saved items, recent searches with their dates, the onboarded flag — on the
 *  app's storage in memory (as lib/queue.test.ts does). bun test does not resolve the `@/` alias, so the modules that
 *  import `@/lib/storage-keys` are given the real one. */
import { beforeEach, describe, expect, it, mock } from "bun:test";

const store = new Map<string, string | boolean>();
mock.module("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => {
      const value = store.get(key);
      return typeof value === "string" ? value : undefined;
    },
    getBoolean: (key: string) => {
      const value = store.get(key);
      return typeof value === "boolean" ? value : undefined;
    },
    set: (key: string, value: string | boolean) => void store.set(key, value),
    remove: (key: string) => store.delete(key),
  }),
}));
const keys = await import("../../lib/storage-keys");
mock.module("@/lib/storage-keys", () => keys);
const saved = await import("../saved/saved");
const recent = await import("../explore/recent-searches");
const { adoptLocalData, clearMemberData, forgetLocalOwner, LOCAL_OWNER_KEY } = await import("./local-owner");

const london = { code: "LHR", city: "London", name: "Heathrow", countryCode: "GB", lat: 51.47, lng: -0.45 };

/** Member A's phone: a saved destination, London searched with dates, onboarding done. */
function aUsedThePhone(): void {
  saved.toggleSaved("destination", "LHR");
  recent.rememberSearch(london, { depart: "2026-11-12", return: "2026-11-19" });
  keys.appStorage.set(keys.ONBOARDED_KEY, true);
}

function memberData() {
  return {
    saved: keys.appStorage.getString(saved.SAVED_KEY) !== undefined,
    recent: recent.readRecentSearches().length,
    onboarded: keys.appStorage.getBoolean(keys.ONBOARDED_KEY) === true,
  };
}

beforeEach(() => {
  clearMemberData();
  forgetLocalOwner();
});

describe("adoptLocalData — the phone's member data belongs to a member", () => {
  it("another member signs in: A's saved items, dated recent searches and onboarded flag go", () => {
    adoptLocalData("A");
    aUsedThePhone();
    expect(memberData()).toEqual({ saved: true, recent: 1, onboarded: true });
    adoptLocalData("B");
    expect(memberData()).toEqual({ saved: false, recent: 0, onboarded: false });
    expect(keys.appStorage.getString(LOCAL_OWNER_KEY)).toBe("B");
  });

  it("the same member signs in again (a lapsed session): everything stays", () => {
    adoptLocalData("A");
    aUsedThePhone();
    adoptLocalData("A");
    expect(memberData()).toEqual({ saved: true, recent: 1, onboarded: true });
  });

  it("no owner yet (an install before this marker): the data is the member's who signs in", () => {
    aUsedThePhone();
    adoptLocalData("A");
    expect(memberData()).toEqual({ saved: true, recent: 1, onboarded: true });
    expect(keys.appStorage.getString(LOCAL_OWNER_KEY)).toBe("A");
  });
});

describe("clearMemberData — an explicit Sign out or Delete account", () => {
  it("removes the saved list, the recent searches (with their dates) and the onboarded flag", () => {
    aUsedThePhone();
    clearMemberData();
    expect(memberData()).toEqual({ saved: false, recent: 0, onboarded: false });
    expect(keys.appStorage.getString(recent.RECENT_SEARCHES_KEY)).toBeUndefined();
  });

  it("forgetting the owner leaves the next sign-in to adopt the phone fresh", () => {
    adoptLocalData("A");
    forgetLocalOwner();
    expect(keys.appStorage.getString(LOCAL_OWNER_KEY)).toBeUndefined();
  });
});
