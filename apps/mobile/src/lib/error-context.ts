export type MessageKind =
  "gone" | "notSent" | "route" | "update" | "maintenance" | "generic" | "wrongPassword" | "deleteFailed";

export function stateCopy(kind: MessageKind): { title: string; body: string } {
  switch (kind) {
    case "gone":
      return {
        title: "This fare has changed.",
        body: "This fare is no longer available. A specialist can help you find another option.",
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
        body: "Your account could not be deleted. Try again or call your specialist.",
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

export function submitFailureKind(code?: string): "notSent" | "queued" | "rateLimited" {
  if (code === "RATE_LIMITED") return "rateLimited";
  if (code === "TIMEOUT" || code === "OFFLINE") return "queued";
  return "notSent";
}

/** What a screen could not read (readFailureCopy). */
export type ReadSubject = "request" | "requests" | "explore" | "profile" | "fare";

/**
 * A screen that reads and could not. Offline says so — never the sending copy ("We'll send this…"), there is nothing to
 * send here — and promises a reload only where one comes (ADR-IMPL-047): the requests list loads again by itself once
 * the phone is back online (it listens for it), so offline it says it will; every other page waits for its Try again. A
 * timeout is not offline — the phone is online and nothing reloads by itself — so it is the page's own message, as
 * anything else is.
 */
export function readFailureCopy(code: string | undefined, what: ReadSubject): { title: string; body: string } {
  if (code !== "OFFLINE") return stateCopy("route");
  return {
    title: "You’re offline.",
    body: what === "requests" ? "Your requests load when you’re back online." : "Try again when you’re back online.",
  };
}

/** Over a list already on screen, when a reload did not answer: what is shown may be out of date — never "This screen
 *  could not be loaded", which the list on screen contradicts. `loaded` false: the server has not answered once yet,
 *  and only the requests waiting on the phone are shown — nothing was there to refresh. Offline, the list loads again
 *  by itself once the phone is back online; a timeout is not offline (ADR-IMPL-047). */
export function refreshFailedLine(code: string | undefined, loaded = true): string {
  if (code === "OFFLINE") return "You’re offline. Your requests load when you’re back online.";
  return loaded ? "We couldn’t refresh your requests just now." : "We couldn’t load your other requests just now.";
}
