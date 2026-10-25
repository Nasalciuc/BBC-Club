/**
 * A screen's own copy of the profile and the shared store (profile-save-logic.ts): the pre-registered check of brief
 * 3.4.1 (D1) — after a name is saved, Explore (the store) and Profile (its own copy) show it at once, and `Member`
 * never comes back. Every name, code and number here is made up.
 */
import { beforeEach, describe, expect, it } from "bun:test";

import type { Profile } from "@/lib/api";

import { firstName } from "../explore/greeting";
import { profileName } from "./name-logic";
import { withOffers, type SavedProfile } from "./notifications-logic";
import { profileCopy } from "./profile-save-logic";
import { loadProfile, profileSnapshot, resetProfile } from "./profile-store";

/** A member as GET /v1/profile and PATCH answer them; with CRM_ADAPTER=email a new member has no name. */
function row(over: Partial<Profile> = {}): Profile {
  return {
    memberId: "m1",
    displayName: null,
    homeAirport: "JFK",
    phone: null,
    notifications: { requestUpdates: true, offers: true },
    ...over,
  } as unknown as Profile;
}

/** A screen's own copy, as React's `setProfile` keeps it: the updater applied to what is held. */
function screen(initial: Profile | null) {
  let held = initial;
  const copy = profileCopy((update) => {
    held = update(held);
  });
  return { copy, held: () => held };
}

/** The store as Explore leaves it: the member's profile loaded. */
async function storeLoaded(profile: Profile) {
  await loadProfile(() => Promise.resolve({ ok: true as const, data: profile }));
}

beforeEach(() => resetProfile());

describe("a name saved on Edit profile is every screen's at once (D1)", () => {
  it("Edit profile's copy, Explore's greeting (the store) and Profile's hero (its copy) show it", async () => {
    await storeLoaded(row());
    const edit = screen(row());
    const profile = screen(row());
    const stop = profile.copy.follow();
    expect(firstName(profileSnapshot()?.displayName)).toBeNull();
    expect(profileName(profile.held()?.displayName)).toBe("Member");

    edit.copy.saved(row({ displayName: "Dana Ives" }));

    expect(edit.held()?.displayName).toBe("Dana Ives");
    expect(firstName(profileSnapshot()?.displayName)).toBe("Dana");
    expect(profileName(profile.held()?.displayName)).toBe("Dana Ives");
    stop();
  });

  it("a load Profile began before the save does not bring `Member` back; one begun after is shown", async () => {
    await storeLoaded(row());
    const profile = screen(row());
    const stop = profile.copy.follow();
    const before = profile.copy.loadBegun();

    screen(row()).copy.saved(row({ displayName: "Dana Ives" }));

    // Profile's focus load, as (tabs)/profile.tsx shows an answer: only while nothing was saved since it began.
    expect(before()).toBe(false);
    expect(profileName(profile.held()?.displayName)).toBe("Dana Ives");
    const after = profile.copy.loadBegun();
    expect(after()).toBe(true);
    stop();
  });

  it("Profile stops hearing saves once it unsubscribes", async () => {
    await storeLoaded(row());
    const profile = screen(row());
    profile.copy.follow()();
    screen(row()).copy.saved(row({ displayName: "Dana Ives" }));
    expect(profile.held()?.displayName).toBeNull();
    expect(profileSnapshot()?.displayName).toBe("Dana Ives");
  });
});

describe("Profile's and Settings' own sheets reach the store too", () => {
  it("a home airport saved on Profile is Explore's and the request sheet's at once", async () => {
    await storeLoaded(row());
    const profile = screen(row());
    profile.copy.saved(row({ homeAirport: "BOS" }));
    expect(profile.held()?.homeAirport).toBe("BOS");
    expect(profileSnapshot()?.homeAirport).toBe("BOS");
  });

  it("a phone saved in Settings is Profile's at once, under it", async () => {
    await storeLoaded(row());
    const settings = screen(row());
    const profile = screen(row());
    const stop = profile.copy.follow();
    settings.copy.saved(row({ phone: "+12125550100" }));
    expect(profile.held()?.phone).toBe("+12125550100");
    expect(profileSnapshot()?.phone).toBe("+12125550100");
    stop();
  });

  it("Profile hears its own save back from the store and nothing more changes", async () => {
    await storeLoaded(row());
    const profile = screen(row());
    const stop = profile.copy.follow();
    const next = row({ displayName: "Dana Ives", homeAirport: "BOS" });
    profile.copy.saved(next);
    expect(profile.held()).toEqual(next);
    stop();
  });

  it("an answer without notifications keeps each copy's own (the offers switch is the screen's)", async () => {
    await storeLoaded(row());
    const profile = screen(row());
    const stop = profile.copy.follow();
    profile.copy.change((prev) => (prev ? withOffers(prev, false) : prev));
    const older: Partial<Profile> = row({ displayName: "Dana Ives" });
    delete older.notifications;
    screen(row()).copy.saved(older as SavedProfile);
    expect(profile.held()?.displayName).toBe("Dana Ives");
    expect(profile.held()?.notifications?.offers).toBe(false);
    stop();
  });

  it("the offers switch stays on the screen: a load begun before it is not shown, the store is not told", async () => {
    await storeLoaded(row());
    const settings = screen(row());
    const before = settings.copy.loadBegun();
    settings.copy.change((prev) => (prev ? withOffers(prev, false) : prev));
    expect(before()).toBe(false);
    expect(settings.held()?.notifications?.offers).toBe(false);
    expect(profileSnapshot()?.notifications?.offers).toBe(true);
  });

  it("before the store holds a profile, a save is the screen's own; the next load brings it everywhere", () => {
    const edit = screen(row());
    edit.copy.saved(row({ displayName: "Dana Ives" }));
    expect(edit.held()?.displayName).toBe("Dana Ives");
    expect(profileSnapshot()).toBeNull();
  });
});
