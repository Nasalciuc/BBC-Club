import { describe, expect, it } from "bun:test";
import { authMessage } from "@bbc/shared/auth-messages";
import { afterResetSignIn, clearOnExit, exitPlan, fail, RESET_DONE_SIGN_IN, type ExitStores } from "./flows-logic";

/** Stores that record what a session's end cleared. */
function recordingStores() {
  const cleared: string[] = [];
  const stores: ExitStores = {
    clearQueue: () => void cleared.push("queue"),
    resetUnreadQuotes: () => void cleared.push("unreadQuotes"),
    clearMemberData: () => void cleared.push("memberData"),
    forgetLocalOwner: () => void cleared.push("localOwner"),
    clearPendingPassword: () => void cleared.push("pendingPassword"),
  };
  return { stores, cleared };
}

describe("exitPlan / clearOnExit — what a session's end clears on the phone", () => {
  it("the member's own Sign out or Delete account: everything of theirs goes", () => {
    for (const kind of ["signOut", "deleted"] as const) {
      expect(exitPlan(kind)).toEqual({ clearQueue: true, clearMemberData: true, forgetOwner: true });
      const { stores, cleared } = recordingStores();
      clearOnExit(kind, stores);
      expect(cleared).toEqual(["queue", "unreadQuotes", "memberData", "localOwner", "pendingPassword"]);
    }
  });

  it("a session the server ended (401): requests saved offline, saved items, recent searches and the owner stay", () => {
    expect(exitPlan("revoked")).toEqual({ clearQueue: false, clearMemberData: false, forgetOwner: false });
    const { stores, cleared } = recordingStores();
    clearOnExit("revoked", stores);
    expect(cleared).toEqual(["unreadQuotes", "pendingPassword"]);
  });
});

describe("afterResetSignIn — the reset succeeded; the sign-in with the new password may not", () => {
  it("signed in: on to the gate", () => {
    expect(afterResetSignIn(null)).toEqual({ ok: true });
  });

  it("5 wrong sign-ins before the reset: /sign-in/email answers 429 — the password is set, Sign in later", () => {
    const result = afterResetSignIn({ status: 429 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe(RESET_DONE_SIGN_IN);
  });

  it("any other refusal, or no connection, is the same: the spent code is never offered again", () => {
    for (const err of [{ status: 500 }, { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 }, "network" as const]) {
      const result = afterResetSignIn(err);
      expect(!result.ok && result.code).toBe(RESET_DONE_SIGN_IN);
    }
  });
});

describe("fail — a Better Auth error in the club's voice", () => {
  it("a code tried too many times is its own answer, not a rate limit (the server deleted it: waiting does not help)", () => {
    const result = fail({ code: "TOO_MANY_ATTEMPTS", status: 403 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("429, or a code that names a limit, is the rate-limit copy", () => {
    for (const err of [{ status: 429 }, { code: "TOO_MANY_REQUESTS", status: 429 }, { code: "RATE_LIMITED" }]) {
      expect(fail(err)).toEqual({ ok: false, code: "RATE_LIMITED", message: authMessage("RATE_LIMITED") });
    }
  });

  it("any other code keeps its own words", () => {
    expect(fail({ code: "INVALID_OTP", status: 400 })).toEqual({
      ok: false,
      code: "INVALID_OTP",
      message: authMessage("INVALID_OTP"),
    });
  });
});
