/** The member's profile, one question at a time for every screen (profile-store.ts, F104). */
import { beforeEach, describe, expect, it } from "bun:test";

import type { Profile } from "@/lib/api";

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

  it("a save for another member, or before any profile was loaded, is not shown", async () => {
    const s = server();
    const saves: string[] = [];
    const stop = subscribeProfileSaves((p) => saves.push(p.memberId));
    storeSavedProfile(renamed("m1", "Dana Ives"));
    expect(profileSnapshot()).toBeNull();
    await loaded(s, "m2");
    storeSavedProfile(renamed("m1", "Dana Ives"));
    expect(profileSnapshot()?.displayName).toBeNull();
    expect(saves).toEqual([]);
    stop();
  });
});
