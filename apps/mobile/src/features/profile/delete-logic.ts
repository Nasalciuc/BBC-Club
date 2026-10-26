import { deleteFailureKind, stateCopy } from "../../lib/error-context";
import { NetworkError, networkFail } from "../../lib/timeout";

/** 35: `Delete account` confirms only with a password typed, and never twice at once. */
export function canConfirmDelete(password: string, busy: boolean): boolean {
  return !busy && password.trim().length > 0;
}

/** The server allows three tries an hour from one address (identity auth.ts customRules `/delete-user`). The call only
 *  when the club's general line is configured (`canCall`, support-phone.ts). */
export function deleteRateLimited(canCall: boolean): string {
  return canCall
    ? "Too many attempts. Try again in an hour, or call your specialist."
    : "Too many attempts. Try again in an hour.";
}
/** The deletion is confirmed with the password: a session older than a day, or an empty field, needs it typed. */
export const DELETE_ENTER_PASSWORD = "Enter your password to delete your account.";
/** A member who joined by code and never set a password: the server has none to check (Better Auth answers
 *  CREDENTIAL_ACCOUNT_NOT_FOUND). The Password sheet asks for the current one, so the way to set one is the reset. */
export const DELETE_SET_PASSWORD_FIRST =
  "Your account has no password yet. Sign out, choose “Forgot password?” to set one, then delete your account here.";

/** Why the account was not deleted, and where: under the field when the password is what to change, else in the sheet. */
export type DeleteFailureCopy = { at: "field" | "sheet"; text: string };

/**
 * The words for a failed deletion. Only the codes the sheet can act on differently are decided here; every other one
 * keeps `deleteFailureKind`'s answer (lib/error-context.ts). `emptyField`: nothing was typed in the password field.
 * `canCall`: the club's general line is configured — only then do the words point at a call.
 */
export function deleteFailureCopy(code: string | undefined, emptyField = false, canCall = false): DeleteFailureCopy {
  if (code === "RATE_LIMITED") return { at: "sheet", text: deleteRateLimited(canCall) };
  if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND") return { at: "sheet", text: DELETE_SET_PASSWORD_FIRST };
  if (code === "SESSION_EXPIRED" || (code === "INVALID_PASSWORD" && emptyField)) {
    return { at: "field", text: DELETE_ENTER_PASSWORD };
  }
  if (code === "OFFLINE" || code === "TIMEOUT")
    return { at: "sheet", text: networkFail(new NetworkError(code)).message };
  if (deleteFailureKind(code) === "wrongPassword") return { at: "field", text: stateCopy("wrongPassword").title };
  const failure = stateCopy("deleteFailed", canCall);
  return { at: "sheet", text: `${failure.title} ${failure.body}` };
}
