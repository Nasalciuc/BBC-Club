import { describe, it, expect } from "bun:test";
import {
  REJECTED_KEPT_MS,
  afterAttempt,
  applyResults,
  backoffMs,
  RETRY_SOON_MAX_MS,
  RETRY_SOON_MS,
  flushItems,
  nextFlushDelay,
  parseQueue,
  pruneExpired,
  type QueuedRequest,
} from "./queue-logic";
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

const A = "q_00000000-0000-4000-8000-000000000001";
const B = "q_00000000-0000-4000-8000-000000000002";
const C = "q_00000000-0000-4000-8000-000000000003";

function item(over: Partial<QueuedRequest> = {}): QueuedRequest {
  return {
    id: over.id ?? A,
    body,
    idempotencyKey: over.idempotencyKey ?? "key-1",
    enqueuedAt: over.enqueuedAt ?? "2026-09-18T12:00:00.000Z",
    attempts: over.attempts ?? 0,
    ...(over.notBefore ? { notBefore: over.notBefore } : {}),
    ...(over.rejectedAt ? { rejectedAt: over.rejectedAt } : {}),
  };
}

const NOW = Date.parse("2026-09-27T12:00:00.000Z");

describe("parseQueue", () => {
  it("accepts a valid list", () => {
    const parsed = parseQueue(JSON.stringify([item()]));
    expect(parsed.ok && parsed.items).toHaveLength(1);
    expect(parsed.ok && parsed.bad).toEqual([]);
  });

  it("one item that no longer reads is set aside on its own; the others stay", () => {
    const broken = { ...item({ id: B }), body: { ...body, contact: { ...body.contact, name: "" } } };
    const parsed = parseQueue(JSON.stringify([item(), broken]));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.items.map((q) => q.id)).toEqual([A]);
      expect(parsed.bad).toHaveLength(1);
    }
  });

  it("not a list, or not JSON: nothing reads", () => {
    expect(parseQueue("{").ok).toBe(false);
    expect(parseQueue('{"id":"x"}').ok).toBe(false);
  });

  it("keeps the destination's city, and reads items queued before it was kept", () => {
    const withCity = parseQueue(JSON.stringify([{ ...item(), city: "London" }]));
    expect(withCity.ok && withCity.items[0]?.city).toBe("London");
    const older = parseQueue(JSON.stringify([item()]));
    expect(older.ok && older.items[0]?.city).toBeUndefined();
  });

  it("an id without the q_ prefix is no queued request", () => {
    const raw = JSON.stringify([{ ...item(), id: "00000000-0000-4000-8000-000000000001" }]);
    const parsed = parseQueue(raw);
    expect(parsed.ok && parsed.items).toEqual([]);
  });
});

describe("afterAttempt — never discard it (Figma 325:8384)", () => {
  it("offline costs no attempt and no wait: it goes when the phone is back", () => {
    const r = afterAttempt(item({ attempts: 2 }), { ok: false, status: 0 }, NOW);
    expect(r.outcome).toBe("offline");
    expect(r.keep).toEqual(item({ attempts: 2 }));
  });

  it("a server failure waits longer each time — 1, 2, 4, 8, 16, then every 30 minutes — and is never dropped", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 40].map((n) => backoffMs(n) / 60_000)).toEqual([1, 2, 4, 8, 16, 30, 30, 30]);
    const sixth = afterAttempt(item({ attempts: 5 }), { ok: false, status: 503 }, NOW);
    expect(sixth.outcome).toBe("failed");
    expect(sixth.keep?.attempts).toBe(6);
    expect(sixth.keep?.notBefore).toBe("2026-09-27T12:30:00.000Z");
    const later = afterAttempt(item({ attempts: 40 }), "throw", NOW);
    expect(later.keep?.attempts).toBe(41);
  });

  it("a 429 waits as long as the server asks and costs no attempt", () => {
    const r = afterAttempt(item({ attempts: 5 }), { ok: false, status: 429, retryAfterS: 360 }, NOW);
    expect(r.outcome).toBe("failed");
    expect(r.keep?.attempts).toBe(5);
    expect(r.keep?.notBefore).toBe("2026-09-27T12:06:00.000Z");
  });

  it("a refusal for good (400, 409) stays on the phone, marked, never tried again", () => {
    for (const status of [400, 409]) {
      const r = afterAttempt(item(), { ok: false, status }, NOW);
      expect(r.outcome).toBe("rejected");
      expect(r.keep?.rejectedAt).toBe("2026-09-27T12:00:00.000Z");
    }
  });

  it("a session to renew costs no attempt", () => {
    const r = afterAttempt(item(), { ok: false, status: 401 }, NOW);
    expect(r.outcome).toBe("failed");
    expect(r.keep).toEqual(item());
  });
});

describe("flushItems", () => {
  it("still attempts the third item when the second throws, and says what happened to each", async () => {
    const a = item({ id: A, idempotencyKey: "a" });
    const b = item({ id: B, idempotencyKey: "b" });
    const c = item({ id: C, idempotencyKey: "c" });
    const seen: string[] = [];
    const r = await flushItems(
      [a, b, c],
      async (_body, key) => {
        seen.push(key);
        if (key === "b") throw new Error("boom");
        return { ok: true };
      },
      NOW,
    );
    expect(seen).toEqual(["a", "b", "c"]);
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.outcomes).toEqual({ [A]: "sent", [B]: "failed", [C]: "sent" });
    expect(r.results.get(A)).toBeNull();
    expect(r.results.get(B)?.attempts).toBe(1);
  });

  it("a request that waits is left for later — unless the member asked (Send now)", async () => {
    const waiting = item({ notBefore: "2026-09-27T12:06:00.000Z" });
    let calls = 0;
    const submit = async () => {
      calls += 1;
      return { ok: true };
    };
    const early = await flushItems([waiting], submit, NOW);
    expect(calls).toBe(0);
    expect(early.outcomes[A]).toBe("skipped");
    expect(early.results.has(A)).toBe(false);
    const asked = await flushItems([waiting], submit, NOW, { manual: true });
    expect(calls).toBe(1);
    expect(asked.outcomes[A]).toBe("sent");
  });

  it("a request the server refused is never tried again, not even by Send now", async () => {
    let calls = 0;
    const r = await flushItems(
      [item({ rejectedAt: "2026-09-27T11:00:00.000Z" })],
      async () => {
        calls += 1;
        return { ok: true };
      },
      NOW,
      { manual: true },
    );
    expect(calls).toBe(0);
    expect(r.outcomes[A]).toBe("skipped");
  });

  it("once the queue is no longer ours (a sign-out cleared it), nothing more is sent from it", async () => {
    let ours = true;
    const seen: string[] = [];
    const r = await flushItems(
      [item({ id: A, idempotencyKey: "a" }), item({ id: B, idempotencyKey: "b" })],
      async (_body, key) => {
        seen.push(key);
        ours = false;
        return { ok: true };
      },
      NOW,
      { stillOurs: () => ours },
    );
    expect(seen).toEqual(["a"]);
    expect(r.outcomes).toEqual({ [A]: "sent", [B]: "skipped" });
    expect(r.results.has(B)).toBe(false);
  });
});

describe("nextFlushDelay — when a request waiting on the phone is tried again with the app left open", () => {
  it("nothing waits: no try is due", () => {
    expect(nextFlushDelay([], NOW)).toBeNull();
    expect(nextFlushDelay([item({ rejectedAt: "2026-09-27T11:00:00.000Z" })], NOW)).toBeNull();
  });

  it("a request due now (saved after a timeout, or its wait is over) is tried soon, not in a tight loop", () => {
    expect(nextFlushDelay([item()], NOW)).toBe(RETRY_SOON_MS);
    expect(nextFlushDelay([item({ notBefore: "2026-09-27T11:59:00.000Z" })], NOW)).toBe(RETRY_SOON_MS);
  });

  it("a request waiting after a server failure is tried when its wait ends — the earliest one first", () => {
    const later = item({ id: A, notBefore: "2026-09-27T12:30:00.000Z" });
    const sooner = item({ id: B, notBefore: "2026-09-27T12:04:00.000Z" });
    expect(nextFlushDelay([later, sooner], NOW)).toBe(4 * 60_000);
  });

  it("each try in a row that sent nothing waits twice as long — 30 s, 1, 2, 4, then every 5 minutes", () => {
    const due = [item()];
    expect([0, 1, 2, 3, 4, 5, 40].map((quiet) => nextFlushDelay(due, NOW, quiet))).toEqual([
      30_000,
      60_000,
      120_000,
      240_000,
      RETRY_SOON_MAX_MS,
      RETRY_SOON_MAX_MS,
      RETRY_SOON_MAX_MS,
    ]);
    // A request waiting after a server failure keeps its own time: the server's back-off already spaces it.
    expect(nextFlushDelay([item({ notBefore: "2026-09-27T12:02:00.000Z" })], NOW, 4)).toBe(2 * 60_000);
  });

  it("a refused request never sets the time, and a wait about to end still leaves a second", () => {
    const refused = item({ id: A, rejectedAt: "2026-09-27T11:00:00.000Z" });
    const waiting = item({ id: B, notBefore: "2026-09-27T12:10:00.000Z" });
    expect(nextFlushDelay([refused, waiting], NOW)).toBe(10 * 60_000);
    expect(nextFlushDelay([item({ notBefore: "2026-09-27T12:00:00.200Z" })], NOW)).toBe(1_000);
  });
});

describe("applyResults — the queue as it is now, not as it was when the flush began", () => {
  it("keeps a request saved during the flush, removes the sent one, replaces the tried one", () => {
    const sent = item({ id: A });
    const tried = item({ id: B });
    const savedMeanwhile = item({ id: C, idempotencyKey: "new" });
    const results = new Map<string, QueuedRequest | null>([
      [A, null],
      [B, { ...tried, attempts: 1 }],
    ]);
    const next = applyResults([savedMeanwhile, sent, tried], results);
    expect(next.map((q) => [q.id, q.attempts])).toEqual([
      [C, 0],
      [B, 1],
    ]);
  });

  it("a request removed during the flush stays removed", () => {
    const results = new Map<string, QueuedRequest | null>([[A, { ...item(), attempts: 1 }]]);
    expect(applyResults([], results)).toEqual([]);
  });
});

describe("pruneExpired", () => {
  it("a refused request leaves the phone a week after the refusal; nothing else ever expires", () => {
    const refused = item({ id: A, rejectedAt: new Date(NOW - REJECTED_KEPT_MS - 1).toISOString() });
    const recent = item({ id: B, rejectedAt: new Date(NOW - 60_000).toISOString() });
    const old = item({ id: C, enqueuedAt: "2025-01-01T00:00:00.000Z", attempts: 99 });
    expect(pruneExpired([refused, recent, old], NOW).map((q) => q.id)).toEqual([B, C]);
  });
});
