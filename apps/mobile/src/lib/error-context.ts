export type MessageKind =
  "gone" | "notSent" | "route" | "update" | "maintenance" | "generic" | "wrongPassword" | "deleteFailed";

/**
 * A message's words. `canCall`: the club's general line is configured (support-phone.ts `CAN_CALL`) — only then may a
 * message point at a call; without it, the calm way on (DESIGN.md, Product Content).
 */
export function stateCopy(kind: MessageKind, canCall = false): { title: string; body: string } {
  switch (kind) {
    case "gone":
      return {
        title: "This fare has changed.",
        body: "This fare is no longer available. An agent can help you find another option.",
      };
    case "notSent":
      return {
        title: "This request didn’t send.",
        body: "Try again in a moment. Your details are still here.",
      };
    // Figma 240:5093 / 240:5129 / 240:5163: the page-wide messages.
    case "route":
      return {
        title: "Something didn’t load.",
        body: "We couldn’t load this page. Please try again.",
      };
    case "update":
      return {
        title: "A new version is ready.",
        body: "Update BuyBusinessClass to continue exploring and requesting fares.",
      };
    case "maintenance":
      return {
        title: "We’ll be back shortly.",
        body: "We’re making a few improvements. Please check back soon.",
      };
    case "wrongPassword":
      return {
        title: "That password isn’t right.",
        body: "Enter the password you use to sign in.",
      };
    case "deleteFailed":
      return {
        title: "Something went wrong.",
        body: canCall
          ? "Your account could not be deleted. Try again or call your agent."
          : "Your account could not be deleted. Try again in a moment.",
      };
    case "generic":
      return {
        title: "Something went wrong.",
        body: "Try again in a moment.",
      };
  }
}

export function deleteFailureKind(code?: string): "wrongPassword" | "deleteFailed" {
  return code === "INVALID_PASSWORD" ? "wrongPassword" : "deleteFailed";
}

/**
 * A request that did not reach the club — offline, a timeout, or the club's server not answering while the phone is
 * online — is kept on the phone and sent later; its Idempotency-Key makes a send that did arrive count once.
 */
export function submitFailureKind(code?: string): "notSent" | "queued" | "rateLimited" {
  if (code === "RATE_LIMITED") return "rateLimited";
  if (code === "TIMEOUT" || code === "OFFLINE" || code === "UNREACHABLE") return "queued";
  return "notSent";
}

/** What a call that reached no server says when the phone itself is online (F110). */
export const UNREACHABLE_MESSAGE = "We can’t reach the club right now. Try again in a moment.";

/**
 * Why a call reached no server, from what the platform says about the network (NetInfo) at that moment: `OFFLINE` only
 * when it says the phone is off the network; otherwise — online, or not known — it is the club's server that did not
 * answer (DNS, TLS, the server down): `UNREACHABLE`, never "You're offline" (F110).
 */
export function classifyFetchFailure(
  state: { isConnected?: boolean | null; isInternetReachable?: boolean | null } | null | undefined,
): "OFFLINE" | "UNREACHABLE" {
  return state?.isConnected === false || state?.isInternetReachable === false ? "OFFLINE" : "UNREACHABLE";
}

/** What a screen could not read (readFailureCopy). */
export type ReadSubject = "request" | "requests" | "explore" | "profile" | "fare";

/**
 * A screen that reads and could not. Offline says so — never the sending copy ("We'll send this…"), there is nothing to
 * send here — and promises a reload only where one comes (ADR-IMPL-047): the requests list loads again by itself once
 * the phone is back online (it listens for it), so offline it says it will; every other page waits for its Try again. A
 * timeout is not offline — the phone is online and nothing reloads by itself — so it is the page's own message, as
 * anything else is. A club that did not answer while the phone is online says just that (F110), with `Try again`.
 */
export function readFailureCopy(code: string | undefined, what: ReadSubject): { title: string; body: string } {
  if (code === "UNREACHABLE") return { title: "We can’t reach the club right now.", body: "Try again in a moment." };
  if (code !== "OFFLINE") return stateCopy("route");
  return {
    title: "You’re offline.",
    body: what === "requests" ? "Your requests load when you’re back online." : "Try again when you’re back online.",
  };
}

/** The pages whose failure frame offers the club's number beside `Try again`: Profile, where `Call us` lives (12). */
const CALL_ON_FAILURE: ReadonlySet<ReadSubject> = new Set(["profile"]);

/**
 * What a page's failure frame offers (F114): `Try again`, and on Profile `Call us` too when the club's general line is
 * configured (`canCall`, support-phone.ts) — as the app gate's pages offer it.
 */
export function errorFrameActions(what: ReadSubject, canCall: boolean): ("retry" | "call")[] {
  return CALL_ON_FAILURE.has(what) && canCall ? ["retry", "call"] : ["retry"];
}

/** Over a list already on screen, when a reload did not answer: what is shown may be out of date — never "This screen
 *  could not be loaded", which the list on screen contradicts. `loaded` false: the server has not answered once yet,
 *  and only the requests waiting on the phone are shown — nothing was there to refresh. Offline, the list loads again
 *  by itself once the phone is back online; a timeout is not offline (ADR-IMPL-047), nor a club that did not answer
 *  while the phone is online (`UNREACHABLE`, F110). */
export function refreshFailedLine(code: string | undefined, loaded = true): string {
  if (code === "OFFLINE") return "You’re offline. Your requests load when you’re back online.";
  return loaded ? "We couldn’t refresh your requests just now." : "We couldn’t load your other requests just now.";
}

/**
 * A password change the server made but could not finish: the new password is set, the other devices are still signed
 * in (`context.passwordChanged`, ADR-IMPL-047). Its words for the saved frame, or null for any other failure — the
 * change did not happen and the form stays.
 */
export function passwordChangedNotice(body: unknown): string | null {
  const error = (body as { error?: { message?: unknown; context?: { passwordChanged?: unknown } } } | null)?.error;
  if (error?.context?.passwordChanged !== true) return null;
  return typeof error.message === "string" && error.message.length > 0
    ? error.message
    : "Your new password is set, but your other devices are still signed in.";
}
