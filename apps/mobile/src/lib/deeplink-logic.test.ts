import { describe, expect, it } from "bun:test";
import { linkCanOpen, linkFromNotification, routeFromDeepLinkUrl, systemPathFor } from "./deeplink-logic";

describe("routeFromDeepLinkUrl", () => {
  it("bare requests → Requests tab", () => {
    expect(routeFromDeepLinkUrl("bbcclub://requests")).toBe("/(tabs)/requests");
  });

  it("requests/<uuid> → request detail", () => {
    const id = "00000000-0000-4000-8000-0000000000a1";
    expect(routeFromDeepLinkUrl(`bbcclub://requests/${id}`)).toEqual({
      pathname: "/request/[id]",
      params: { id },
    });
  });
});

describe("linkFromNotification — a tapped push opens its request", () => {
  const tap = (data: unknown, action = "default") => ({
    actionIdentifier: action,
    notification: { request: { content: { data } } },
  });
  const id = "00000000-0000-4000-8000-0000000000a1";

  it("the quote-ready push carries the request's link", () => {
    expect(linkFromNotification(tap({ deepLink: `bbcclub://requests/${id}` }), "default")).toBe(
      `bbcclub://requests/${id}`,
    );
  });

  it("iOS keeps a remote push's own keys in the trigger's payload; Android's FCM data may sit in remoteMessage", () => {
    const link = `bbcclub://requests/${id}`;
    const ios = {
      actionIdentifier: "default",
      notification: {
        request: {
          content: { data: null },
          trigger: { type: "push", payload: { aps: { alert: "Q" }, deepLink: link } },
        },
      },
    };
    expect(linkFromNotification(ios, "default")).toBe(link);
    const fcm = {
      actionIdentifier: "default",
      notification: {
        request: { content: { data: {} }, trigger: { type: "push", remoteMessage: { data: { deepLink: link } } } },
      },
    };
    expect(linkFromNotification(fcm, "default")).toBe(link);
    const local = {
      actionIdentifier: "default",
      notification: { request: { content: { data: {} }, trigger: { type: "date", payload: { deepLink: link } } } },
    };
    expect(linkFromNotification(local, "default")).toBeNull();
  });

  it("an empty or unknown link in content.data never hides a good one further on", () => {
    const link = `bbcclub://requests/${id}`;
    const push = (data: unknown, trigger: unknown) => ({
      actionIdentifier: "default",
      notification: { request: { content: { data }, trigger } },
    });
    expect(linkFromNotification(push({ deepLink: "" }, { type: "push", payload: { deepLink: link } }), "default")).toBe(
      link,
    );
    expect(
      linkFromNotification(
        push({ deepLink: "bbcclub://elsewhere" }, { type: "push", remoteMessage: { data: { deepLink: link } } }),
        "default",
      ),
    ).toBe(link);
    expect(
      linkFromNotification(
        push({ deepLink: "bbcclub://elsewhere" }, { type: "push", payload: { deepLink: "" } }),
        "default",
      ),
    ).toBeNull();
  });

  it("no tap, an action button, no link or a link this app does not route: nothing", () => {
    expect(linkFromNotification(null, "default")).toBeNull();
    expect(linkFromNotification(tap({ deepLink: `bbcclub://requests/${id}` }, "dismiss"), "default")).toBeNull();
    expect(linkFromNotification(tap({}), "default")).toBeNull();
    expect(linkFromNotification(tap(undefined), "default")).toBeNull();
    expect(linkFromNotification(tap({ deepLink: 42 }), "default")).toBeNull();
    expect(linkFromNotification(tap({ deepLink: "bbcclub://elsewhere" }), "default")).toBeNull();
  });
});

describe("systemPathFor — Expo Router leaves the club's links to the root layout", () => {
  it("a club link is not routed as a path of its own", () => {
    expect(systemPathFor("bbcclub://requests/00000000-0000-4000-8000-0000000000a1")).toBeNull();
    expect(systemPathFor("bbcclub://inbox")).toBeNull();
  });

  it("a club link without its scheme, as Expo Router may hand it over, is the root layout's too", () => {
    const id = "00000000-0000-4000-8000-0000000000a1";
    expect(systemPathFor(`requests/${id}`)).toBeNull();
    expect(systemPathFor(`fare/${id}`)).toBeNull();
  });

  it("any other link at launch opens the app's start, never the screen it names with the params it carries", () => {
    // A forged `Request received` page: the attacker's phone number, city and pictures (F014).
    const spoof =
      "bbcclub://request/confirmed?id=x&source=offer&queued=0&phone=%2B15550100&city=London&from=JFK&to=XXX" +
      "&media=https://evil.example/a.png&carrier=Club&logo=https://evil.example/l.png";
    expect(systemPathFor(spoof)).toBe("/");
    expect(systemPathFor("request/confirmed?id=x&phone=%2B1555")).toBe("/");
    expect(systemPathFor("request/limited?minutes=1")).toBe("/");
    expect(systemPathFor("onboarding")).toBe("/");
    expect(systemPathFor("bbcclub://settings")).toBe("/");
    expect(systemPathFor("/settings")).toBe("/");
    // The app opened from its icon: Expo Router asks with the root URL.
    expect(systemPathFor("bbcclub:///")).toBe("/");
  });

  it("while the app runs, any other link only brings it forward: the member stays where they are", () => {
    expect(systemPathFor("bbcclub://request/confirmed?id=x&phone=%2B1555", false)).toBeNull();
    expect(systemPathFor("bbcclub://onboarding", false)).toBeNull();
    expect(systemPathFor("bbcclub://requests/00000000-0000-4000-8000-0000000000a1", false)).toBeNull();
  });

  it("only a development build opens the component gallery by its link", () => {
    expect(systemPathFor("bbcclub://dev/gallery", true, true)).toBe("/dev/gallery");
    expect(systemPathFor("bbcclub://dev/gallery")).toBe("/");
    expect(systemPathFor("bbcclub://dev/other", true, true)).toBe("/");
  });
});

describe("linkCanOpen — a link waits until the member is in and the gate has decided", () => {
  const hold = new Set(["sign-in", "join", "reset-password", "set-password", "verify-code", "onboarding"]);
  it("signed in, inside the app: it opens", () => {
    expect(linkCanOpen("(tabs)", true, hold)).toBe(true);
    expect(linkCanOpen("request", true, hold)).toBe(true);
  });
  it("signed out, on the first screen, or on an entry or gate screen: it waits", () => {
    expect(linkCanOpen("(tabs)", false, hold)).toBe(false);
    expect(linkCanOpen("index", true, hold)).toBe(false);
    for (const leaf of hold) expect(linkCanOpen(leaf, true, hold)).toBe(false);
  });
});
