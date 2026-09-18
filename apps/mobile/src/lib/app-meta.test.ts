import { describe, it, expect } from "bun:test";
import { mapAppPlatform } from "./app-platform";

describe("mapAppPlatform", () => {
  it("maps android to android and everything else to ios", () => {
    expect(mapAppPlatform("android")).toBe("android");
    expect(mapAppPlatform("ios")).toBe("ios");
    expect(mapAppPlatform("web")).toBe("ios");
  });
});
