import { describe, expect, it } from "bun:test";
import { stateCopy } from "../../lib/error-context";
import { OFFLINE_MESSAGE } from "../../lib/timeout";
import { refuseEmptyPassword } from "../auth/flows-logic";
import { canConfirmDelete, DELETE_ENTER_PASSWORD, DELETE_SET_PASSWORD_FIRST, deleteFailureCopy } from "./delete-logic";

describe("deleteFailureCopy — why the account was not deleted, where the member can act on it", () => {
  it("the hourly limit (3 tries per hour per address) says when to try again, not just `Try again`", () => {
    const copy = deleteFailureCopy("RATE_LIMITED");
    expect(copy.at).toBe("sheet");
    expect(copy.text).toContain("hour");
  });

  it("points at a call only when the club's general line is configured", () => {
    expect(deleteFailureCopy("RATE_LIMITED", false, true).text).toBe(
      "Too many attempts. Try again in an hour, or call your specialist.",
    );
    expect(deleteFailureCopy("RATE_LIMITED", false, false).text).toBe("Too many attempts. Try again in an hour.");
    expect(deleteFailureCopy("UNKNOWN", false, true).text).toContain("call your specialist");
    for (const code of ["RATE_LIMITED", "UNKNOWN", undefined]) {
      expect(deleteFailureCopy(code).text.toLowerCase()).not.toContain("call");
    }
  });

  it("a session older than a day, or an empty field, asks for the password on the field", () => {
    expect(deleteFailureCopy("SESSION_EXPIRED")).toEqual({ at: "field", text: DELETE_ENTER_PASSWORD });
    expect(deleteFailureCopy("INVALID_PASSWORD", true)).toEqual({ at: "field", text: DELETE_ENTER_PASSWORD });
  });

  it("a member with no password yet is told how to set one, not 'could not be deleted'", () => {
    expect(deleteFailureCopy("CREDENTIAL_ACCOUNT_NOT_FOUND")).toEqual({ at: "sheet", text: DELETE_SET_PASSWORD_FIRST });
    expect(DELETE_SET_PASSWORD_FIRST).toContain("Forgot password?");
  });

  it("a wrong password marks the field, as before", () => {
    expect(deleteFailureCopy("INVALID_PASSWORD")).toEqual({ at: "field", text: stateCopy("wrongPassword").title });
  });

  it("no connection says so; anything else keeps the sheet's own failure", () => {
    expect(deleteFailureCopy("OFFLINE")).toEqual({ at: "sheet", text: OFFLINE_MESSAGE });
    expect(deleteFailureCopy("TIMEOUT").text).toContain("check your connection");
    const failed = stateCopy("deleteFailed");
    expect(deleteFailureCopy("UNKNOWN")).toEqual({ at: "sheet", text: `${failed.title} ${failed.body}` });
    expect(deleteFailureCopy(undefined)).toEqual({ at: "sheet", text: `${failed.title} ${failed.body}` });
  });
});

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
