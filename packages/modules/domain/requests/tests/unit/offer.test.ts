/** askOffer: whether the member could have seen the offer a request names — and never a refusal for a read that failed. */
import { describe, expect, it } from "bun:test";
import type { AskFailure } from "../../src/application/ask-within";
import { askOffer, type ProposalOffer } from "../../src/application/offer";

const now = new Date("2026-10-22T12:00:00Z");
const later = new Date("2026-11-22T12:00:00Z");
const earlier = new Date("2026-10-01T12:00:00Z");
const offer = (over: Partial<ProposalOffer>): ProposalOffer => ({
  targeting: "broadcast",
  targetMemberId: null,
  status: "active",
  validUntil: later,
  ...over,
});

function ask(visible: unknown, stored: ProposalOffer | null, memberId: string | null = "m-1") {
  return askOffer(
    { visible: async () => visible, stored: async () => stored, memberId, now },
    { unavailable: () => undefined },
  );
}

describe("askOffer", () => {
  it("visible now: ok", async () => {
    expect(await ask({ id: "o" }, offer({}))).toBe("ok");
  });

  it("no such offer: missing", async () => {
    expect(await ask(null, null)).toBe("missing");
  });

  it("open and not visible to the member — someone else's, or not yet published: not_yours", async () => {
    expect(await ask(null, offer({ targeting: "user", targetMemberId: "m-2" }))).toBe("not_yours");
    expect(await ask(null, offer({ status: "scheduled" }))).toBe("not_yours");
    expect(await ask(null, offer({ status: "draft" }))).toBe("not_yours");
  });

  it("gone since — withdrawn, expired, past its validity: ok when broadcast, theirs, or a segment's", async () => {
    expect(await ask(null, offer({ status: "withdrawn" }))).toBe("ok");
    expect(await ask(null, offer({ status: "expired", targeting: "user", targetMemberId: "m-1" }))).toBe("ok");
    expect(await ask(null, offer({ validUntil: earlier, targeting: "segment" }))).toBe("ok");
    expect(await ask(null, offer({ status: "withdrawn", targeting: "user", targetMemberId: "m-2" }))).toBe("not_yours");
  });

  it("a read that fails or is slow checks nothing (null), reported by reason", async () => {
    const reasons: AskFailure[] = [];
    const failing = await askOffer(
      {
        visible: async () => {
          throw new Error("proposals down");
        },
        stored: async () => null,
        memberId: "m-1",
      },
      { unavailable: (r) => reasons.push(r) },
    );
    const slow = await askOffer(
      { visible: () => new Promise((resolve) => setTimeout(resolve, 50)), stored: async () => null, memberId: "m-1" },
      { timeoutMs: 5, unavailable: (r) => reasons.push(r) },
    );
    expect([failing, slow]).toEqual([null, null]);
    expect(reasons).toEqual(["error", "timeout"]);
    await Bun.sleep(60);
  });
});
