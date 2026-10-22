import { deleteFailureKind, stateCopy } from "../../lib/error-context";
import { NetworkError, networkFail } from "../../lib/timeout";

/** 35: `Delete account` confirms only with a password typed, and never twice at once. */
export function canConfirmDelete(password: string, busy: boolean): boolean {
  return !busy && password.trim().length > 0;
}

/** The server allows three tries an hour from one address (identity auth.ts customRules `/delete-user`). */
export const DELETE_RATE_LIMITED = "Too many attempts. Try again in an hour, or call your specialist.";
/** The deletion is confirmed with the password: a session older than a day, or an empty field, needs it typed. */
export const DELETE_ENTER_PASSWORD = "Enter your password to delete your account.";

/** Why the account was not deleted, and where: under the field when the password is what to change, else in the sheet. */
export type DeleteFailureCopy = { at: "field" | "sheet"; text: string };

/**
 * The words for a failed deletion. Only the codes the sheet can act on differently are decided here; every other one
 * keeps `deleteFailureKind`'s answer (lib/error-context.ts). `emptyField`: nothing was typed in the password field.
 */
export function deleteFailureCopy(code: string | undefined, emptyField = false): DeleteFailureCopy {
  if (code === "RATE_LIMITED") return { at: "sheet", text: DELETE_RATE_LIMITED };
  if (code === "SESSION_EXPIRED" || (code === "INVALID_PASSWORD" && emptyField)) {
    return { at: "field", text: DELETE_ENTER_PASSWORD };
  }
  if (code === "OFFLINE" || code === "TIMEOUT")
    return { at: "sheet", text: networkFail(new NetworkError(code)).message };
  if (deleteFailureKind(code) === "wrongPassword") return { at: "field", text: stateCopy("wrongPassword").title };
  const failure = stateCopy("deleteFailed");
  return { at: "sheet", text: `${failure.title} ${failure.body}` };
}
