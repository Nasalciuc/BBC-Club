import { describe, expect, it } from "bun:test";
import { routeFromDeepLinkUrl } from "./deeplink-logic";

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
