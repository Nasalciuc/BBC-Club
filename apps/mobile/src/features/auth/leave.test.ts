import { describe, expect, it } from "bun:test";
import type { Href } from "expo-router";
// The router expo-router 57 ships for the root <Stack> (StackRouter REPLACE swaps only the focused route).
import { StackRouter } from "expo-router/build/react-navigation/routers/StackRouter";
import { clearStack, leaveTo, type LeaveRouter } from "./leave";

/** A router that records what it was asked, with or without a stack to dismiss. */
function recording(canDismiss: boolean) {
  const calls: string[] = [];
  const router: LeaveRouter = {
    canDismiss: () => canDismiss,
    dismissAll: () => void calls.push("dismissAll"),
    replace: (href: Href) => void calls.push(`replace:${String(href)}`),
  };
  return { router, calls };
}

describe("leaveTo — the destination is the only route left", () => {
  it("sign-out from a pushed screen: the stack goes, then the entry replaces what remains", () => {
    const { router, calls } = recording(true);
    leaveTo(router, "/sign-in");
    expect(calls).toEqual(["dismissAll", "replace:/sign-in"]);
  });

  it("nothing to dismiss: only the replace", () => {
    const { router, calls } = recording(false);
    leaveTo(router, "/sign-in");
    expect(calls).toEqual(["replace:/sign-in"]);
  });

  it("post-auth: after Join, Verify and the password, onboarding is the only route (Back cannot reach Join)", () => {
    const { router, calls } = recording(true);
    leaveTo(router, "/onboarding");
    expect(calls).toEqual(["dismissAll", "replace:/onboarding"]);
  });

  it("clearStack alone (the deletion sheet, whose screen then replaces to Join)", () => {
    const withStack = recording(true);
    clearStack(withStack.router);
    expect(withStack.calls).toEqual(["dismissAll"]);
    const without = recording(false);
    clearStack(without.router);
    expect(without.calls).toEqual([]);
  });
});

describe("leaveTo on expo-router's own StackRouter", () => {
  const routeNames = ["index", "sign-in", "join", "verify-code", "set-password", "onboarding", "(tabs)", "settings"];
  const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
  const stack = StackRouter({});

  /** The root stack driven the way expo-router dispatches `dismissAll` (POP_TO_TOP) and `replace` (REPLACE). */
  function rootStack(names: string[]) {
    let state = {
      ...stack.getInitialState(options),
      routes: names.map((name, i) => ({ key: `${name}-${i}`, name })),
      index: names.length - 1,
    };
    const apply = (action: Parameters<typeof stack.getStateForAction>[1]) => {
      const next = stack.getStateForAction(state, action, options);
      if (next) state = next as typeof state;
      return next;
    };
    const router: LeaveRouter = {
      canDismiss: () => state.routes.length > 1,
      dismissAll: () => void apply({ type: "POP_TO_TOP" }),
      replace: (href: Href) =>
        void apply({ type: "REPLACE", target: state.key, payload: { name: String(href).slice(1), params: {} } }),
    };
    return {
      router,
      names: () => state.routes.map((r) => r.name),
      back: () => apply({ type: "GO_BACK" }),
    };
  }

  it("a bare replace from Settings leaves the member's tabs under Sign in (the defect)", () => {
    const root = rootStack(["index", "(tabs)", "settings"]);
    root.router.replace("/sign-in");
    expect(root.names()).toEqual(["index", "(tabs)", "sign-in"]);
  });

  it("leaveTo from Settings: Sign in alone, and Back has nothing to return to", () => {
    const root = rootStack(["index", "(tabs)", "settings"]);
    leaveTo(root.router, "/sign-in");
    expect(root.names()).toEqual(["sign-in"]);
    expect(root.back()).toBeNull();
  });

  it("leaveTo after Join: onboarding alone, Join is gone", () => {
    const root = rootStack(["index", "sign-in", "join", "set-password"]);
    leaveTo(root.router, "/onboarding");
    expect(root.names()).toEqual(["onboarding"]);
  });
});
