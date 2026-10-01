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
    case "route":
      return {
        title: "Something went wrong.",
        body: "This screen could not be loaded.",
      };
    case "update":
      return {
        title: "We've improved the app.",
        body: "Please update to keep requesting fares.",
      };
    case "maintenance":
      return {
        title: "Back in a moment.",
        body: "We're making a quick improvement.",
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
