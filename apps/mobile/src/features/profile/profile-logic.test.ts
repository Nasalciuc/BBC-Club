import { describe, expect, it } from "bun:test";

import { clientSince } from "./profile-logic";

describe("clientSince", () => {
  it("names the year the member joined, nothing for a stub", () => {
    expect(clientSince("2019-03-02T10:00:00.000Z")).toBe("Client since 2019");
    expect(clientSince(null)).toBeNull();
    expect(clientSince(undefined)).toBeNull();
    expect(clientSince("not a date")).toBeNull();
  });
});
