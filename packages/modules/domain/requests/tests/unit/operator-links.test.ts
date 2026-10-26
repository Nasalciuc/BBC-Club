/** The operator's action links (send-requests' e-mail, /ops/requests/:token): a signature only a secret can make. */
import { describe, expect, it } from "bun:test";
import { signAction, verifyAction } from "../../src/application/operator-links";

const SECRET = "ops-link-secret-ops-link-secret-0000";
const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const now = Date.parse("2026-10-18T10:00:00Z");

describe("operator links", () => {
  it("a link signed with the secret opens its request and its action, for a week", () => {
    const token = signAction(SECRET, REQUEST, "quoted", now);
    expect(verifyAction(SECRET, token, now)).toEqual({ ok: true, requestId: REQUEST, action: "quoted" });
    expect(verifyAction(SECRET, token, now + 8 * 24 * 3600 * 1000)).toEqual({ ok: false, reason: "expired" });
  });

  it("another secret, or a token changed by hand, is a bad signature", () => {
    const token = signAction(SECRET, REQUEST, "booked", now);
    expect(verifyAction("another-secret-another-secret-00000000", token, now)).toEqual({
      ok: false,
      reason: "signature",
    });
    const [, signature] = token.split(".");
    const forged = `${Buffer.from(`${REQUEST}.closed.${Math.floor(now / 1000) + 3600}`).toString("base64url")}.${signature}`;
    expect(verifyAction(SECRET, forged, now)).toEqual({ ok: false, reason: "signature" });
  });

  it("with no secret set, nothing verifies — not even a link signed with the empty secret anyone can compute", () => {
    const forged = signAction("", REQUEST, "booked", now);
    expect(verifyAction("", forged, now)).toEqual({ ok: false, reason: "signature" });
    expect(verifyAction("", signAction(SECRET, REQUEST, "booked", now), now)).toEqual({
      ok: false,
      reason: "signature",
    });
  });
});
