/** The app-wide flush's timer (lib/flush-timer.ts) on a clock the test moves by hand. */
import { describe, expect, it } from "bun:test";
import type { RequestBody } from "@bbc/shared/api/v1/requests";
import { createFlushTimer } from "./flush-timer";
import { RETRY_SOON_MAX_MS, type QueuedRequest } from "./queue-logic";

const body: RequestBody = {
  tripType: "oneway",
  cabin: "business",
  legs: [{ from: "JFK", to: "LHR", date: "2027-10-12" }],
  passengers: { adult: 1, child: 0, infant: 0 },
  contact: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
};

const due: QueuedRequest = {
  id: "q_00000000-0000-4000-8000-000000000001",
  body,
  idempotencyKey: "key-1",
  enqueuedAt: "2026-10-08T11:00:00.000Z",
  attempts: 0,
};

/** Timers that run only when the test says so. */
function clock() {
  let t = Date.parse("2026-10-08T12:00:00.000Z");
  let seq = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => t,
    setTimer: (run: () => void, ms: number) => {
      seq += 1;
      timers.set(seq, { at: t + ms, run });
      return seq;
    },
    clearTimer: (handle: unknown) => {
      timers.delete(handle as number);
    },
    live: () => timers.size,
    /** In how long the next timer runs, or null. */
    nextIn: () => {
      const at = [...timers.values()].map((x) => x.at).sort((a, b) => a - b)[0];
      return at === undefined ? null : at - t;
    },
    /** Run the next timer and let what it started settle. */
    async tick() {
      const [id, next] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
      if (id === undefined || !next) throw new Error("no timer");
      timers.delete(id);
      t = next.at;
      next.run();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

function setup(opts: { items?: QueuedRequest[]; online?: () => Promise<boolean>; sent?: () => number } = {}) {
  const c = clock();
  let items = opts.items ?? [due];
  let flushes = 0;
  const timer = createFlushTimer({
    pending: () => items,
    online: opts.online ?? (async () => true),
    flush: async () => {
      flushes += 1;
      return { sent: opts.sent ? opts.sent() : 0 };
    },
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
  });
  return {
    c,
    timer,
    flushes: () => flushes,
    setItems: (next: QueuedRequest[]) => {
      items = next;
    },
  };
}

describe("the app-wide flush's timer", () => {
  it("nothing waits on the phone: no timer at all", () => {
    const { c, timer } = setup({ items: [] });
    timer.schedule();
    expect(c.live()).toBe(0);
  });

  it("a request due now is tried in 30 s; each try that sent nothing waits twice as long, up to 5 minutes", async () => {
    const { c, timer, flushes } = setup();
    timer.schedule();
    const waits: (number | null)[] = [];
    for (let i = 0; i < 6; i++) {
      waits.push(c.nextIn());
      await c.tick();
    }
    expect(waits).toEqual([30_000, 60_000, 120_000, 240_000, RETRY_SOON_MAX_MS, RETRY_SOON_MAX_MS]);
    expect(flushes()).toBe(6);
    expect(c.live()).toBe(1);
  });

  it("a try that sent something, or a fresh start, brings the wait back to 30 s", async () => {
    let sent = 0;
    const { c, timer } = setup({ sent: () => sent });
    timer.schedule();
    await c.tick();
    await c.tick();
    expect(c.nextIn()).toBe(120_000);
    sent = 1;
    await c.tick();
    expect(c.nextIn()).toBe(30_000);
    sent = 0;
    await c.tick();
    expect(c.nextIn()).toBe(60_000);
    timer.reset();
    timer.schedule();
    expect(c.nextIn()).toBe(30_000);
  });

  it("offline: no flush, and the timer stays alive, backing off", async () => {
    const { c, timer, flushes } = setup({ online: async () => false });
    timer.schedule();
    await c.tick();
    expect(flushes()).toBe(0);
    expect(c.nextIn()).toBe(60_000);
  });

  it("a network check that throws counts as a quiet try; the timer stays alive", async () => {
    const { c, timer, flushes } = setup({
      online: async () => {
        throw new Error("netinfo");
      },
    });
    timer.schedule();
    await c.tick();
    expect(flushes()).toBe(0);
    expect(c.nextIn()).toBe(60_000);
  });

  it("the queue emptied: the next schedule leaves no timer", async () => {
    const { c, timer, setItems } = setup();
    timer.schedule();
    setItems([]);
    timer.schedule();
    expect(c.live()).toBe(0);
  });

  it("after stop (a sign-out), a timer already set never flushes and nothing is set again", async () => {
    let release!: (online: boolean) => void;
    const { c, timer, flushes } = setup({
      online: () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    });
    timer.schedule();
    const running = c.tick();
    timer.stop();
    release(true);
    await running;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(flushes()).toBe(0);
    expect(c.live()).toBe(0);
    timer.schedule();
    expect(c.live()).toBe(0);
  });

  it("a read that tidies the queue and calls schedule again leaves one timer, which stop clears", () => {
    const c = clock();
    let reentered = false;
    const timer = createFlushTimer({
      pending: () => {
        if (!reentered) {
          reentered = true;
          timer.schedule(); // what subscribeQueue does when the read writes the tidied queue back
        }
        return [due];
      },
      online: async () => true,
      flush: async () => ({ sent: 0 }),
      now: c.now,
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
    });
    timer.schedule();
    expect(c.live()).toBe(1);
    timer.stop();
    expect(c.live()).toBe(0);
  });
});
