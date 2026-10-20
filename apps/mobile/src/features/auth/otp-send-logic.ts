import { NetworkError, networkFail } from "@/lib/timeout";

/** What Join / Forgot password may say after asking the server to mail a code. */
export type OtpSendResult = { ok: true; message: string } | { ok: false; message: string; code: "OFFLINE" | "TIMEOUT" };

/** The client's answer to a send: an error with an HTTP status means the server answered; no status, no answer. */
export type OtpSendAnswer = { error: { status?: number } | null };

function fromTransport(e: unknown): OtpSendResult {
  const n = networkFail(e instanceof NetworkError ? e : e);
  return { ok: false, message: n.message, code: n.code };
}

/**
 * The outcome of a first code send (Join, Forgot password). Constant-shape while the server answered — success,
 * a refusal, a rate limit: the screen must not reveal whether the email has an account (no oracle). Only when
 * nothing answered at all (the client threw, the 10 s budget ran out, or the error carries no HTTP status) does
 * the member hear about the connection and stay on the screen, instead of waiting for a code that never left.
 */
export async function otpSendResult(attempt: () => Promise<OtpSendAnswer>, constant: string): Promise<OtpSendResult> {
  let error: OtpSendAnswer["error"];
  try {
    ({ error } = await attempt());
  } catch (e) {
    return fromTransport(e);
  }
  if (error && !(typeof error.status === "number" && error.status >= 100)) return fromTransport(error);
  return { ok: true, message: constant };
}
