import type { Href } from "expo-router";

/** The part of expo-router's router that leaving needs (a fake one in leave.test.ts). */
export type LeaveRouter = {
  canDismiss(): boolean;
  dismissAll(): void;
  replace(href: Href): void;
};

/**
 * Pop the root stack back to its first route. `router.replace` alone swaps only the focused route (expo-router 57
 * StackRouter REPLACE): from Settings, Sign in would land on top of the member's tabs, and Back would reopen them.
 */
export function clearStack(router: Pick<LeaveRouter, "canDismiss" | "dismissAll">): void {
  if (router.canDismiss()) router.dismissAll();
}

/**
 * Go to `href` with nothing under it: on leaving the club (sign-out, a revoked session — Back must not show the
 * previous member's screens) and on entering it (post-auth — Back must not show Join or Verify to a signed-in member).
 * Both actions are queued together and run in one pass of expo-router's routing queue.
 */
export function leaveTo(router: LeaveRouter, href: Href): void {
  clearStack(router);
  router.replace(href);
}
