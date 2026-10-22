import { describe, expect, it } from "bun:test";
import { refuseEmptyPassword } from "../auth/flows-logic";
import { canConfirmDelete } from "./delete-logic";

describe("canConfirmDelete — the red pill needs the password (35)", () => {
  it("an empty field, or one of spaces only, keeps it disabled", () => {
    expect(canConfirmDelete("", false)).toBe(false);
    expect(canConfirmDelete("   ", false)).toBe(false);
  });

  it("a typed password enables it; while deleting it stays blocked", () => {
    expect(canConfirmDelete("x", false)).toBe(true);
    expect(canConfirmDelete("x", true)).toBe(false);
  });
});

describe("refuseEmptyPassword — deleteAccount never sends an empty password", () => {
  // better-auth 1.6.31 checks the password only `if (ctx.body.password)`: "" deletes a fresh session's account.
  it("an empty or blank password is refused as INVALID_PASSWORD before any request", () => {
    for (const password of ["", "  "]) {
      const refused = refuseEmptyPassword(password);
      expect(refused?.ok).toBe(false);
      expect(refused && !refused.ok ? refused.code : null).toBe("INVALID_PASSWORD");
    }
  });

  it("a typed password goes through", () => {
    expect(refuseEmptyPassword("atlantic2026!")).toBeNull();
  });
});
