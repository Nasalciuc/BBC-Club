/** The member's profile, one question at a time for every screen (profile-store.ts, F104). */
import { beforeEach, describe, expect, it } from "bun:test";

import type { Profile } from "@/lib/api";

import type { SavedProfile } from "./notifications-logic";
import {
  loadProfile,
  profileSnapshot,
  refreshProfile,
  resetProfile,
  storeSavedProfile,
  subscribeProfile,
  subscribeProfileSaves,
} from "./profile-store";

type Answer = { ok: true; data: Profile } | { ok: false };

const member = (name: string) => ({ memberId: name, displayName: name, homeAirport: "JFK" }) as unknown as Profile;
/** The same member (`memberId`) under another name: a profile the Name sheet saved. Names here are made up. */
const renamed = (memberId: string, displayName: string | null) =>
  ({
    memberId,
    displayName,
    homeAirport: "JFK",
    notifications: { requestUpdates: true, offers: true },
  }) as unknown as Profile;

/** A server whose answers arrive when the test says so, counting the questions. */
function server() {
  let asked = 0;
  const waiting: ((a: Answer) => void)[] = [];
  return {
    fetchProfile: () => {
      asked += 1;
      return new Promise<Answer>((resolve) => waiting.push(resolve));
    },
    answer: (a: Answer) => waiting.shift()?.(a),
    asked: () => asked,
  };
}

beforeEach(() => resetProfile());

describe("the profile store (F104)", () => {
  it("concurrent readers share one question — Explore, its home, a destination: one GET /v1/profile", async () => {
    const s = server();
    const reads = [loadProfile(s.fetchProfile), refreshProfile(s.fetchProfile), loadProfile(s.fetchProfile)];
    expect(s.asked()).toBe(1);
    s.answer({ ok: true, data: member("ada") });
    const answers = await Promise.all(reads);
    expect(answers.map((p) => p?.displayName)).toEqual(["ada", "ada", "ada"]);
    expect(profileSnapshot()?.displayName).toBe("ada");
  });

  it("a profile already loaded is read without asking; a focus refresh asks once", async () => {
    const s = server();
    const first = loadProfile(s.fetchProfile);
    s.answer({ ok: true, data: member("ada") });
    await first;
    expect((await loadProfile(s.fetchProfile))?.displayName).toBe("ada");
    expect(s.asked()).toBe(1);
    const focus = [refreshProfile(s.fetchProfile), refreshProfile(s.fetchProfile)];
    expect(s.asked()).toBe(2);
    s.answer({ ok: true, data: member("ada lovelace") });
    await Promise.all(focus);
    expect(profileSnapshot()?.displayName).toBe("ada lovelace");
  });

  it("a failed answer keeps the last profile; listeners hear each new one", async () => {
    const s = server();
    let heard = 0;
    const unsubscribe = subscribeProfile(() => {
      heard += 1;
    });
    const first = refreshProfile(s.fetchProfile);
    s.answer({ ok: true, data: member("ada") });
    await first;
    const failed = refreshProfile(s.fetchProfile);
    s.answer({ ok: false });
    await failed;
    expect(profileSnapshot()?.displayName).toBe("ada");
    expect(heard).toBe(1);
    unsubscribe();
  });

  it("a change of member drops the profile and every question asked for the member before", async () => {
    const s = server();
    const before = refreshProfile(s.fetchProfile);
    resetProfile();
    expect(profileSnapshot()).toBeNull();
    const after = loadProfile(s.fetchProfile);
    expect(s.asked()).toBe(2);
    s.answer({ ok: true, data: member("previous") });
    s.answer({ ok: true, data: member("next") });
    await Promise.all([before, after]);
    expect(profileSnapshot()?.displayName).toBe("next");
  });
});

describe("a save is every screen's at once (brief 3.4.1)", () => {
  /** A profile loaded for `memberId` with no name: what CRM_ADAPTER=email leaves every new member with. */
  async function loaded(s: ReturnType<typeof server>, memberId = "m1") {
    const first = loadProfile(s.fetchProfile);
    s.answer({ ok: true, data: renamed(memberId, null) });
    await first;
  }

  it("the saved name is the store's profile at once, and the screens and Profile hear it", async () => {
    const s = server();
    await loaded(s);
    let heard = 0;
    const saves: (string | null)[] = [];
    const stopSnapshot = subscribeProfile(() => {
      heard += 1;
    });
    const stopSaves = subscribeProfileSaves((p) => saves.push(p.displayName));
    storeSavedProfile(renamed("m1", "Dana Ives"));
    expect(profileSnapshot()?.displayName).toBe("Dana Ives");
    expect(heard).toBe(1);
    expect(saves).toEqual(["Dana Ives"]);
    // Read again without asking: the save is the profile now.
    expect((await loadProfile(s.fetchProfile))?.displayName).toBe("Dana Ives");
    expect(s.asked()).toBe(1);
    stopSnapshot();
    stopSaves();
  });

  it("a question asked before the save does not bring the old name back; the next one asks again", async () => {
    const s = server();
    await loaded(s);
    const before = refreshProfile(s.fetchProfile);
    storeSavedProfile(renamed("m1", "Dana Ives"));
    const after = refreshProfile(s.fetchProfile);
    expect(s.asked()).toBe(3);
    s.answer({ ok: true, data: renamed("m1", null) });
    expect((await before)?.displayName).toBe("Dana Ives");
    expect(profileSnapshot()?.displayName).toBe("Dana Ives");
    s.answer({ ok: true, data: renamed("m1", "Dana Ives") });
    expect((await after)?.displayName).toBe("Dana Ives");
  });

  it("an answer without notifications keeps the ones known", async () => {
    const s = server();
    await loaded(s);
    const row = { ...renamed("m1", "Dana Ives") } as Partial<Profile>;
    delete row.notifications;
    storeSavedProfile(row as Profile);
    expect(profileSnapshot()?.notifications).toEqual({ requestUpdates: true, offers: true });
  });

  it("a save for another member is nobody's: the store keeps its own and no screen hears it", async () => {
    const s = server();
    await loaded(s, "m2");
    const saves: string[] = [];
    const stop = subscribeProfileSaves((p) => saves.push(p.memberId));
    storeSavedProfile(renamed("m1", "Dana Ives"));
    expect(profileSnapshot()?.memberId).toBe("m2");
    expect(profileSnapshot()?.displayName).toBeNull();
    expect(saves).toEqual([]);
    stop();
  });

  it("with no profile loaded here (Explore's question failed), the screens with their own copy still hear the save", async () => {
    const s = server();
    const saves: (string | null)[] = [];
    const stop = subscribeProfileSaves((p) => saves.push(p.displayName));
    const failed = refreshProfile(s.fetchProfile);
    s.answer({ ok: false });
    await failed;
    storeSavedProfile(renamed("m1", "Dana Ives"));
    // No profile from a save alone (an older server's has no notifications); Profile's copy has the name.
    expect(profileSnapshot()).toBeNull();
    expect(saves).toEqual(["Dana Ives"]);
    // Explore's next question brings it.
    const next = refreshProfile(s.fetchProfile);
    s.answer({ ok: true, data: renamed("m1", "Dana Ives") });
    expect((await next)?.displayName).toBe("Dana Ives");
    stop();
  });

  it("with no profile loaded here, a question on its way is not dropped: a reader waiting on it gets its answer", async () => {
    const s = server();
    // Explore's airport waits on the first question (useExploreHome): dropping it would start the search from New York.
    const waiting = loadProfile(s.fetchProfile);
    // PATCH's answer carries the member's airport as the server holds it: the same as the GET answer's here.
    storeSavedProfile(patchRow("m1", "Dana Ives", { homeAirport: "BOS" }));
    s.answer({ ok: true, data: { ...renamed("m1", null), homeAirport: "BOS" } as Profile });
    expect((await waiting)?.homeAirport).toBe("BOS");
  });
});

/**
 * An older server's PATCH /v1/profile answer: the raw row, without `notifications`. Today's answers the whole profile,
 * as GET does (ADR-IMPL-025), as `renamed(...)` builds it.
 */
function patchRow(memberId: string, displayName: string | null, over: Partial<Profile> = {}): SavedProfile {
  const row: Partial<Profile> = { ...renamed(memberId, displayName), ...over };
  delete row.notifications;
  return row as SavedProfile;
}

describe("a save made while the store holds no profile and a question is on its way (review of 7d849c6)", () => {
  it("the answer to the question asked before the save does not bring the old name back", async () => {
    const s = server();
    // Explore's first GET /v1/profile is on its way; Edit profile's Name sheet saves before it answers.
    const first = refreshProfile(s.fetchProfile);
    storeSavedProfile(patchRow("m1", "Dana Ives"));
    // A reader asking now joins the question on its way.
    const joined = loadProfile(s.fetchProfile);
    expect(s.asked()).toBe(1);
    s.answer({
      ok: true,
      data: { ...renamed("m1", null), notifications: { requestUpdates: true, offers: false } } as Profile,
    });
    expect((await first)?.displayName).toBe("Dana Ives");
    expect((await joined)?.displayName).toBe("Dana Ives");
    expect(profileSnapshot()?.displayName).toBe("Dana Ives");
    // An older server's PATCH answer has no notifications: the answer's stay.
    expect(profileSnapshot()?.notifications).toEqual({ requestUpdates: true, offers: false });
  });

  it("today's PATCH answer is the whole profile (ADR-IMPL-025): laid over the old answer, the save wins whole", async () => {
    const s = server();
    const first = refreshProfile(s.fetchProfile);
    // The offers switch turned off before the name was saved (made-up values): PATCH answers with both.
    storeSavedProfile({
      ...renamed("m1", "Dana Ives"),
      homeAirport: "BOS",
      notifications: { requestUpdates: true, offers: false },
    });
    // Asked before both: the old name, airport and switch.
    s.answer({ ok: true, data: renamed("m1", null) });
    const shown = await first;
    expect(shown?.displayName).toBe("Dana Ives");
    expect(shown?.homeAirport).toBe("BOS");
    expect(shown?.notifications).toEqual({ requestUpdates: true, offers: false });
  });

  it("a home airport saved meanwhile is the airport Explore's search starts from", async () => {
    const s = server();
    const waiting = loadProfile(s.fetchProfile);
    storeSavedProfile(patchRow("m1", null, { homeAirport: "BOS" }));
    s.answer({ ok: true, data: renamed("m1", null) });
    expect((await waiting)?.homeAirport).toBe("BOS");
  });

  it("another member's save is never laid over the answer", async () => {
    const s = server();
    const first = refreshProfile(s.fetchProfile);
    storeSavedProfile(patchRow("m1", "Dana Ives"));
    s.answer({ ok: true, data: renamed("m2", null) });
    await first;
    expect(profileSnapshot()?.memberId).toBe("m2");
    expect(profileSnapshot()?.displayName).toBeNull();
  });

  it("a change of member drops the save with the question it waited on", async () => {
    const s = server();
    const before = refreshProfile(s.fetchProfile);
    storeSavedProfile(patchRow("m1", "Dana Ives"));
    resetProfile();
    // The same member signs in again; the server holds another name by then (made up).
    const after = refreshProfile(s.fetchProfile);
    expect(s.asked()).toBe(2);
    s.answer({ ok: true, data: renamed("m1", null) });
    s.answer({ ok: true, data: renamed("m1", "Robin Hale") });
    await Promise.all([before, after]);
    expect(profileSnapshot()?.displayName).toBe("Robin Hale");
  });

  it("a later save replaces an earlier one", async () => {
    const s = server();
    const first = refreshProfile(s.fetchProfile);
    storeSavedProfile(patchRow("m1", "Dana Ives"));
    storeSavedProfile(patchRow("m1", "Dana Ives-Hale"));
    s.answer({ ok: true, data: renamed("m1", null) });
    expect((await first)?.displayName).toBe("Dana Ives-Hale");
  });

  it("the save is laid over that one answer only: the next question's answer is shown as it comes", async () => {
    const s = server();
    const first = refreshProfile(s.fetchProfile);
    storeSavedProfile(patchRow("m1", "Dana Ives"));
    s.answer({ ok: true, data: renamed("m1", null) });
    await first;
    // Changed on the server since (made up): the next question, asked after the save, is the truth.
    const next = refreshProfile(s.fetchProfile);
    s.answer({ ok: true, data: renamed("m1", "Dana Hale") });
    expect((await next)?.displayName).toBe("Dana Hale");
  });

  it("a failed answer drops the save with its question; the next question, asked after the save, brings it", async () => {
    const s = server();
    const first = refreshProfile(s.fetchProfile);
    storeSavedProfile(patchRow("m1", "Dana Ives"));
    s.answer({ ok: false });
    await first;
    expect(profileSnapshot()).toBeNull();
    const next = refreshProfile(s.fetchProfile);
    s.answer({ ok: true, data: renamed("m1", "Dana Hale") });
    expect((await next)?.displayName).toBe("Dana Hale");
  });

  it("the screens with their own copy hear each save once; the store's readers hear the answer once", async () => {
    const s = server();
    const saves: (string | null)[] = [];
    let heard = 0;
    const stopSaves = subscribeProfileSaves((p) => saves.push(p.displayName));
    const stopSnapshot = subscribeProfile(() => {
      heard += 1;
    });
    const first = refreshProfile(s.fetchProfile);
    storeSavedProfile(patchRow("m1", "Dana Ives"));
    storeSavedProfile(patchRow("m1", "Dana Ives-Hale"));
    expect(saves).toEqual(["Dana Ives", "Dana Ives-Hale"]);
    expect(heard).toBe(0);
    s.answer({ ok: true, data: renamed("m1", null) });
    await first;
    expect(saves).toEqual(["Dana Ives", "Dana Ives-Hale"]);
    expect(heard).toBe(1);
    stopSaves();
    stopSnapshot();
  });
});
