import { describe, it, expect } from "bun:test";
import { afterAttempt, flushItems, parseQueue, type QueuedRequest } from "./queue-logic";
import type { RequestBody } from "@bbc/shared/api/v1/requests";

const body: RequestBody = {
  tripType: "round",
  cabin: "business",
  legs: [
    { from: "JFK", to: "LHR", date: "2026-10-12" },
    { from: "LHR", to: "JFK", date: "2026-10-19" },
  ],
  passengers: { adult: 1, child: 0, infant: 0 },
  contact: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
};

function item(over: Partial<QueuedRequest> = {}): QueuedRequest {
  return {
    id: over.id ?? "q_00000000-0000-4000-8000-000000000001",
    body,
    idempotencyKey: over.idempotencyKey ?? "key-1",
    enqueuedAt: over.enqueuedAt ?? "2026-09-18T12:00:00.000Z",
    attempts: over.attempts ?? 0,
    ...(over.notBefore ? { notBefore: over.notBefore } : {}),
  };
}

describe("parseQueue", () => {
  it("accepts a valid list", () => {
    const raw = JSON.stringify([item()]);
    const parsed = parseQueue(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.items).toHaveLength(1);
  });

  it("rejects an array of numbers instead of overwriting later", () => {
    expect(parseQueue("[1,2,3]").ok).toBe(false);
  });

  it("rejects malformed JSON", () => {
    expect(parseQueue("{").ok).toBe(false);
  });
});

describe("afterAttempt", () => {
  it("removes a 400 and does not retry", () => {
    const r = afterAttempt(item(), { ok: false, status: 400 });
    expect(r.outcome).toBe("dropped");
    expect(r.keep).toBeNull();
  });

  it("keeps a 401 so the member can re-auth", () => {
    const r = afterAttempt(item(), { ok: false, status: 401 });
    expect(r.outcome).toBe("failed");
    expect(r.keep?.attempts).toBe(1);
  });

  it("drops after six transient failures", () => {
    const r = afterAttempt(item({ attempts: 5 }), "throw");
    expect(r.outcome).toBe("dropped");
    expect(r.keep).toBeNull();
  });

  it("a 429 waits and is never dropped, even on the sixth attempt", () => {
    const now = Date.parse("2026-09-27T12:00:00.000Z");
    const r = afterAttempt(item({ attempts: 5 }), { ok: false, status: 429, retryAfterS: 360 }, now);
    expect(r.outcome).toBe("failed");
    expect(r.keep?.attempts).toBe(5);
    expect(r.keep?.notBefore).toBe("2026-09-27T12:06:00.000Z");
  });
});

describe("flushItems", () => {
  it("still attempts the third item when the second throws", async () => {
    const a = item({ id: "q_00000000-0000-4000-8000-000000000001", idempotencyKey: "a" });
    const b = item({ id: "q_00000000-0000-4000-8000-000000000002", idempotencyKey: "b" });
    const c = item({ id: "q_00000000-0000-4000-8000-000000000003", idempotencyKey: "c" });
    const seen: string[] = [];
    const r = await flushItems([a, b, c], async (_body, key) => {
      seen.push(key);
      if (key === "b") throw new Error("offline");
      return { ok: true };
    });
    expect(seen).toEqual(["a", "b", "c"]);
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.remaining).toHaveLength(1);
    expect(r.remaining[0]?.idempotencyKey).toBe("b");
  });

  it("does not submit an item before notBefore", async () => {
    const now = Date.parse("2026-09-27T12:00:00.000Z");
    const waiting = item({ notBefore: "2026-09-27T12:06:00.000Z" });
    let calls = 0;
    const early = await flushItems(
      [waiting],
      async () => {
        calls += 1;
        return { ok: true };
      },
      now,
    );
    expect(calls).toBe(0);
    expect(early.remaining).toHaveLength(1);
    expect(early.failed).toBe(0);
    const later = await flushItems([waiting], async () => ({ ok: true }), Date.parse("2026-09-27T12:06:00.000Z"));
    expect(later.sent).toBe(1);
    expect(later.remaining).toHaveLength(0);
  });
});

describe("q_ id schema", () => {
  it("rejects a bare UUID without the q_ prefix", () => {
    const raw = JSON.stringify([
      {
        id: "00000000-0000-4000-8000-000000000001",
        body,
        idempotencyKey: "k",
        enqueuedAt: "2026-09-18T12:00:00.000Z",
        attempts: 0,
      },
    ]);
    expect(parseQueue(raw).ok).toBe(false);
  });
});
