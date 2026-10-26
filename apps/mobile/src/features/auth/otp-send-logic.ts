import { authMessage } from "@bbc/shared/auth-messages";
import { NetworkError, networkFail } from "../../lib/timeout";

/** Join, when the mail service refused the address (503 / EMAIL_UNDELIVERABLE, g1-otp-send-failure-surfaced). */
export const JOIN_UNDELIVERABLE = "We couldn't send a code to that address. Check it, or call us.";
/** Join, when the server failed some other way: no code left. */
export const JOIN_SEND_FAILED = "We couldn't send a code just now. Try again in a moment.";

/** Which first send: Join (a sign-in code, mailed to any address) or Forgot password (only to a member's). */
export type OtpSendPurpose = "join" | "reset";

/** What Join / Forgot password may say after asking the server to mail a code. */
export type OtpSendResult = { ok: true; message: string } | { ok: false; message: string; code: string };

/** The client's answer to a send: an error with an HTTP status means the server answered; no status, no answer. */
export type OtpSendAnswer = { error: { status?: number; code?: string } | null };

function fromTransport(e: unknown): OtpSendResult {
  const n = networkFail(e instanceof NetworkError ? e : e);
  return { ok: false, message: n.message, code: n.code };
}

/** Join's answer to a send the server refused: no oracle to keep — Path A mails any address alike. */
function joinRefused(error: { status: number; code?: string }): OtpSendResult {
  if (error.status === 503 || error.code === "EMAIL_UNDELIVERABLE") {
    return { ok: false, message: JOIN_UNDELIVERABLE, code: "EMAIL_UNDELIVERABLE" };
  }
  if (error.status >= 500) return { ok: false, message: JOIN_SEND_FAILED, code: "SEND_FAILED" };
  return { ok: false, message: authMessage(error.code), code: error.code ?? "UNKNOWN" };
}

/**
 * The outcome of a first code send (Join, Forgot password); the screen goes on to Verify only on `ok`.
 * - Nothing answered (the client threw, the 10 s budget ran out, or the error carries no HTTP status): the connection
 *   copy, never a code that did not leave.
 * - 429: the limit is per address of the phone, not per email — it reveals nothing, and both screens say to slow down.
 * - Join: any other refusal or failure says so — Path A mails any address, so there is nothing to hide.
 * - Forgot password: constant while the server answered (a refusal, a failure), so the screen never reveals whether the
 *   email has an account (no oracle).
 */
export async function otpSendResult(
  attempt: () => Promise<OtpSendAnswer>,
  constant: string,
  purpose: OtpSendPurpose,
): Promise<OtpSendResult> {
  let error: OtpSendAnswer["error"];
  try {
    ({ error } = await attempt());
  } catch (e) {
    return fromTransport(e);
  }
  if (!error) return { ok: true, message: constant };
  const status = error.status;
  if (!(typeof status === "number" && status >= 100)) return fromTransport(error);
  if (status === 429) return { ok: false, message: authMessage("RATE_LIMITED"), code: "RATE_LIMITED" };
  if (purpose === "join") return joinRefused({ status, code: error.code });
  return { ok: true, message: constant };
}
