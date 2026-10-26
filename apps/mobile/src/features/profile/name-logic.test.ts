/** The member's own name (brief 3.4.1): the Name sheet's rule, its failures, and how Profile and Edit profile say it. */
import { describe, expect, it } from "bun:test";
import { ProfilePatchBody } from "@bbc/shared/api/v1/proposals";
import { RequestBody } from "@bbc/shared/api/v1/requests";

import { bodyProblem } from "../requests/confirmation-logic";
import { firstName } from "../explore/greeting";
import { NAME_MAX, NAME_MIN, checkName, nameRowValue, nameSaveFailure, profileName } from "./name-logic";

/** A request whose contact name is `name`. The trip, the contact and every name in this file are made up. */
function request(name: string) {
  return {
    tripType: "oneway" as const,
    cabin: "business" as const,
    legs: [{ from: "JFK", to: "LHR", date: "2030-11-10" }],
    passengers: { adult: 1, child: 0, infant: 0 },
    contact: { name, phone: "+12125550148", email: "member@example.com" },
  };
}

describe("checkName — the request sheet's rule: trimmed, 2 to 80, storable", () => {
  it("takes a name trimmed, as the server stores it", () => {
    expect(checkName("  Alex Morgan ")).toEqual({ ok: true, name: "Alex Morgan" });
    expect(checkName("Li")).toEqual({ ok: true, name: "Li" });
    expect(checkName("Ana 😀")).toEqual({ ok: true, name: "Ana 😀" });
    expect(checkName("A".repeat(NAME_MAX))).toEqual({ ok: true, name: "A".repeat(NAME_MAX) });
  });

  it("refuses a blank, a single letter and a name past 80 in the request sheet's own words", () => {
    for (const typed of ["", "   ", "A", " A ", "A".repeat(NAME_MAX + 1)]) {
      const checked = checkName(typed);
      expect(checked.ok).toBe(false);
      const parsed = RequestBody.safeParse(request(typed.trim()));
      expect(parsed.success).toBe(false);
      if (!checked.ok && !parsed.success) {
        expect(checked.error).toBe(bodyProblem(parsed.error.issues, request(typed)) ?? "");
      }
    }
    expect(NAME_MIN).toBe(2);
    expect(NAME_MAX).toBe(80);
  });

  it("refuses what Postgres cannot keep, with the contract's own message", () => {
    const refused = ProfilePatchBody.safeParse({ displayName: "An\ud83d" });
    expect(refused.success).toBe(false);
    const message = refused.success ? "" : refused.error.issues[0]!.message;
    expect(checkName("An\ud83d")).toEqual({ ok: false, error: message });
    expect(checkName("a\u0000b")).toEqual({ ok: false, error: message });
  });

  it("every name it takes passes both the profile and a request as it is", () => {
    for (const typed of ["Li", "  Alex Morgan ", "Ana 😀", "B".repeat(NAME_MAX), "Jo-Ann O’Test"]) {
      const checked = checkName(typed);
      if (!checked.ok) throw new Error(`refused ${typed}`);
      expect(ProfilePatchBody.safeParse({ displayName: checked.name }).success).toBe(true);
      expect(RequestBody.safeParse(request(checked.name)).success).toBe(true);
    }
  });
});

describe("nameSaveFailure", () => {
  it("the server refusing the name (400) puts the field at fault, with the server's words", () => {
    expect(nameSaveFailure({ status: 400, message: "Please check the highlighted fields." })).toEqual({
      field: true,
      message: "Please check the highlighted fields.",
    });
  });

  it("offline, a timeout, a busy or silent server: their own calm words, the field not at fault", () => {
    const offline = "You’re offline. Try again when you’re back online.";
    expect(nameSaveFailure({ status: 0, message: offline })).toEqual({ field: false, message: offline });
    for (const status of [0, 404, 429, 500, 503]) {
      expect(nameSaveFailure({ status, message: "Try again in a moment." }).field).toBe(false);
    }
  });
});

describe("profileName and nameRowValue — `Member` never when a name exists", () => {
  it("Profile shows the saved name; `Member` only without one", () => {
    expect(profileName("Dana Ives")).toBe("Dana Ives");
    expect(profileName("  Alex ")).toBe("Alex");
    for (const none of [null, undefined, "", "   "]) expect(profileName(none)).toBe("Member");
  });

  it("Edit profile's row shows the saved name, else `Not set`", () => {
    expect(nameRowValue("Alex Morgan")).toBe("Alex Morgan");
    for (const none of [null, undefined, "", "  "]) expect(nameRowValue(none)).toBe("Not set");
  });

  it("a name saved here greets the member by its first word on Explore", () => {
    const checked = checkName("  Dana   Ives ");
    expect(checked.ok && firstName(checked.name)).toBe("Dana");
  });
});
