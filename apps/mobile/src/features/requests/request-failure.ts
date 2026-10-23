import { RequestVM } from "@bbc/shared/api/v1/requests";

import { readFailureCopy } from "../../lib/error-context";

/**
 * Whether `id` can name a request on the server: its id as the contract reads it (a UUID). Anything else — a link
 * anyone can write, `bbcclub://requests/abc` — is no request at all, and is never asked for: the server cannot read it
 * as an id and answers 500, which would offer `Try again` forever (F015).
 */
export function isRequestId(id: string): boolean {
  return RequestVM.shape.id.safeParse(id).success;
}

/** What the request page offers when it could not load: `Try again`, or the way back to Requests. */
export type RequestFailureAction = "retry" | "backToRequests";

export type RequestFailureFrame = {
  kind: "notFound" | "offline" | "unreachable" | "route";
  title: string;
  body: string;
  actions: RequestFailureAction[];
};

/**
 * The request page's failure frame — pure, so it is tested without React Native. A request the server does not hold
 * for this member (removed, or another account's: the server answers 404 for both) is said so, with only the way back
 * to Requests: asking again can never bring it, as the fare page treats its own 404 (ADR-IMPL-047). Anything else may
 * pass, and keeps `Try again` (F015).
 */
export function requestFailureFrame(result: { status: number; code?: string }): RequestFailureFrame {
  if (result.status === 404 || result.code === "NOT_FOUND") {
    return {
      kind: "notFound",
      title: "We can’t find this request.",
      body: "It may have been removed, or it belongs to another account.",
      actions: ["backToRequests"],
    };
  }
  return {
    kind: result.code === "OFFLINE" ? "offline" : result.code === "UNREACHABLE" ? "unreachable" : "route",
    ...readFailureCopy(result.code, "request"),
    actions: ["retry"],
  };
}
