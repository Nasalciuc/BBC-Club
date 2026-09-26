import { describe, it, expect } from "bun:test";
import { getIPFromHeader } from "@better-auth/core/utils/ip";
import { CLOUDFLARE_RANGES } from "@bbc/shared/net/cloudflare-ranges";

const trusted = { trustedProxies: [...CLOUDFLARE_RANGES] };

describe("client IP behind Cloudflare → Caddy", () => {
  it("one Cloudflare hop", () => expect(getIPFromHeader("203.0.113.9, 173.245.48.1", trusted)).toBe("203.0.113.9"));
  it("a spoofed leading value is ignored", () =>
    expect(getIPFromHeader("1.2.3.4, 203.0.113.9, 173.245.48.1", trusted)).toBe("203.0.113.9"));
  it("the production bug: no trusted proxies → null → one shared bucket", () =>
    expect(getIPFromHeader("203.0.113.9, 173.245.48.1", {})).toBeNull());
});
