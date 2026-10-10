/** The queue on the phone (lib/queue.ts) with its storage in memory: what it saves, what it sets aside, and how one
 *  flush at a time answers the callers that arrive while it runs (ADR-IMPL-041, A2c). */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { RequestBody } from "@bbc/shared/api/v1/requests";
import { parseQueue, type QueuedRequest } from "./queue-logic";

const store = new Map<string, string>();
/** How many more writes the storage takes before the app stops (a test sets it; never, otherwise). */
let writesLeft = Infinity;
const STOPPED = "the app stopped here";
function write(): void {
  if (writesLeft <= 0) throw new Error(STOPPED);
  writesLeft -= 1;
}
mock.module("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => {
      write();
      store.set(key, value);
    },
    remove: (key: string) => {
      write();
      store.delete(key);
    },
  }),
}));
let ids = 0;
mock.module("expo-crypto", () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
}));

const queue = await import("./queue");

const body: RequestBody = {
  tripType: "round",
  cabin: "business",
  legs: [
    { from: "JFK", to: "LHR", date: "2027-10-12" },
    { from: "LHR", to: "JFK", date: "2027-10-19" },
  ],
  passengers: { adult: 1, child: 0, infant: 0 },
  contact: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
};

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** The queue as stored. Every item must read: a broken one left behind fails the test. */
function stored(): QueuedRequest[] {
  const parsed = parseQueue(store.get("pending") ?? "[]");
  if (!parsed.ok || parsed.bad.length > 0) throw new Error("the stored queue does not read");
  return parsed.items;
}

beforeEach(() => {
  writesLeft = Infinity;
  queue.clearQueue();
  store.clear();
});

describe("saving a request on the phone", () => {
  it("only a request that could be sent is saved, and the same key twice saves it once", () => {
    expect(queue.enqueueRequest({ ...body, contact: { ...body.contact, name: "" } }, "key-bad")).toBeNull();
    expect(store.has("pending")).toBe(false);
    const first = queue.enqueueRequest(body, "key-1", "London");
    const again = queue.enqueueRequest(body, "key-1", "London");
    expect(again?.id).toBe(first?.id);
    expect(stored()).toHaveLength(1);
  });

  it("a blob that does not read is set aside once, not on every read; an item that does not read, on its own", () => {
    store.set("pending", "{not json");
    expect(queue.listQueued()).toEqual([]);
    expect(queue.listQueued()).toEqual([]);
    expect([...store.keys()].filter((k) => k.startsWith("pending.corrupt."))).toHaveLength(1);
    expect(store.has("pending")).toBe(false);

    store.clear();
    const good = queue.enqueueRequest(body, "key-good");
    store.set("pending", JSON.stringify([...stored(), { id: "q_broken" }]));
    expect(queue.listQueued().map((q) => q.id)).toEqual([good!.id]);
    expect(stored().map((q) => q.id)).toEqual([good!.id]);
  });

  it("tells whoever listens after each change, until they stop listening", () => {
    let calls = 0;
    const stop = queue.subscribeQueue(() => {
      calls += 1;
    });
    queue.enqueueRequest(body, "key-l");
    expect(calls).toBe(1);
    stop();
    queue.enqueueRequest(body, "key-m");
    expect(calls).toBe(1);
  });
});

describe("one flush at a time", () => {
  it("a request saved while a flush is sending is kept — and sent by the next caller, not answered by that flush", async () => {
    const a = queue.enqueueRequest(body, "key-a");
    const slow = gate();
    const submitted: string[] = [];
    const first = queue.flushQueue(async (_body, key) => {
      submitted.push(key);
      await slow.opened;
      return { ok: true };
    });
    const b = queue.enqueueRequest(body, "key-b");
    const second = queue.flushQueue(async (_body, key) => {
      submitted.push(key);
      return { ok: true };
    });
    slow.open();
    expect((await first).outcomes).toEqual({ [a!.id]: "sent" });
    expect((await second).outcomes).toEqual({ [b!.id]: "sent" });
    expect(submitted).toEqual(["key-a", "key-b"]);
    expect(stored()).toEqual([]);
  });

  it("a caller that saved nothing new is answered by the flush already running", async () => {
    queue.enqueueRequest(body, "key-c");
    const slow = gate();
    let calls = 0;
    const submit = async () => {
      calls += 1;
      await slow.opened;
      return { ok: true };
    };
    const first = queue.flushQueue(submit);
    const second = queue.flushQueue(submit);
    slow.open();
    expect(await second).toEqual(await first);
    expect(calls).toBe(1);
  });

  it("Send now on a waiting request goes, even while an app-wide flush skips it", async () => {
    const a = queue.enqueueRequest(body, "key-a");
    const b = queue.enqueueRequest(body, "key-b");
    // b failed before: it waits half an hour.
    store.set(
      "pending",
      JSON.stringify(
        stored().map((q) =>
          q.id === b?.id ? { ...q, attempts: 6, notBefore: new Date(Date.now() + 30 * 60_000).toISOString() } : q,
        ),
      ),
    );
    const slow = gate();
    const full = queue.flushQueue(async () => {
      await slow.opened;
      return { ok: true };
    });
    const manual = queue.sendOne(b!.id, async () => ({ ok: true }));
    slow.open();
    expect((await full).outcomes).toEqual({ [b!.id]: "skipped", [a!.id]: "sent" });
    expect((await manual).outcomes[b!.id]).toBe("sent");
    expect(stored()).toEqual([]);
  });

  it("Send now pressed while a flush's own try of that request is failing makes a try of its own", async () => {
    const a = queue.enqueueRequest(body, "key-a");
    const slow = gate();
    const tries: string[] = [];
    // The app-wide flush's try began before the press, and times out: no network as far as it knows.
    const full = queue.flushQueue(async () => {
      tries.push("flush");
      await slow.opened;
      return { ok: false, status: 0 };
    });
    const manual = queue.sendOne(a!.id, async () => {
      tries.push("send now");
      return { ok: true };
    });
    slow.open();
    expect((await full).outcomes[a!.id]).toBe("offline");
    expect((await manual).outcomes[a!.id]).toBe("sent");
    expect(tries).toEqual(["flush", "send now"]);
    expect(stored()).toEqual([]);
  });

  it("Send now waiting on a flush that sent the request is answered by it — nothing goes twice", async () => {
    const a = queue.enqueueRequest(body, "key-a");
    const slow = gate();
    let tries = 0;
    const submit = async () => {
      tries += 1;
      await slow.opened;
      return { ok: true };
    };
    const full = queue.flushQueue(submit);
    const manual = queue.sendOne(a!.id, submit);
    slow.open();
    await full;
    expect((await manual).outcomes[a!.id]).toBe("sent");
    expect(tries).toBe(1);
  });

  it("after a sign-out clears the queue, a flush under way sends nothing more and writes nothing back", async () => {
    queue.enqueueRequest(body, "k1");
    queue.enqueueRequest(body, "k2");
    queue.enqueueRequest(body, "k3");
    const slow = gate();
    const submitted: string[] = [];
    let first = true;
    const run = queue.flushQueue(async (_body, key) => {
      submitted.push(key);
      if (first) {
        first = false;
        await slow.opened;
      }
      return { ok: true };
    });
    queue.clearQueue();
    slow.open();
    await run;
    expect(submitted).toHaveLength(1);
    expect(store.has("pending")).toBe(false);
  });
});

describe("whose requests they are", () => {
  it("another member who signs in never sends nor sees what was saved before them; it waits for its member", async () => {
    queue.adoptQueue("member-a");
    const a = queue.enqueueRequest(body, "key-a");
    // A's session expired — no sign-out cleared the phone — and B signs in.
    queue.adoptQueue("member-b");
    expect(queue.listQueued()).toEqual([]);
    expect(queue.getQueued(a!.id)).toBeNull();
    const sent: string[] = [];
    await queue.flushQueue(async (_body, key) => {
      sent.push(key);
      return { ok: false, status: 0 };
    });
    expect(sent).toEqual([]);
    const b = queue.enqueueRequest(body, "key-b");
    // A signs in again: A's request is back, B's is set aside in turn.
    queue.adoptQueue("member-a");
    expect(queue.listQueued().map((q) => q.id)).toEqual([a!.id]);
    queue.adoptQueue("member-b");
    expect(queue.listQueued().map((q) => q.id)).toEqual([b!.id]);
  });

  it("requests saved by an older app, with no owner, belong to whoever signs in next; the same member changes nothing", () => {
    const old = queue.enqueueRequest(body, "key-old");
    queue.adoptQueue("member-a");
    expect(queue.listQueued().map((q) => q.id)).toEqual([old!.id]);
    let calls = 0;
    const stop = queue.subscribeQueue(() => {
      calls += 1;
    });
    queue.adoptQueue("member-a");
    stop();
    expect(calls).toBe(0);
    expect(queue.listQueued().map((q) => q.id)).toEqual([old!.id]);
  });

  it("a flush under way when another member's queue is set aside sends nothing more and writes nothing back", async () => {
    queue.adoptQueue("member-a");
    queue.enqueueRequest(body, "k1");
    queue.enqueueRequest(body, "k2");
    const slow = gate();
    const submitted: string[] = [];
    let first = true;
    const run = queue.flushQueue(async (_body, key) => {
      submitted.push(key);
      if (first) {
        first = false;
        await slow.opened;
      }
      return { ok: true };
    });
    queue.adoptQueue("member-b");
    slow.open();
    await run;
    expect(submitted).toHaveLength(1);
    expect(store.has("pending")).toBe(false);
    // Both stay with A — the one in flight may have reached the server; its Idempotency-Key makes a resend harmless.
    queue.adoptQueue("member-a");
    expect(queue.listQueued()).toHaveLength(2);
  });

  it("an app stopped at any write of a sign-in never leaves one member's requests under another's name", () => {
    // A saves a request; A's session expires and B saves one; B's expires and A signs in again — and the app stops
    // before that sign-in's write number `writes + 1`. It starts again with `next` signed in, then the other member,
    // then `next` again: each sees its own request, and only that.
    function stoppedAt(writes: number, next: "member-a" | "member-b"): boolean {
      writesLeft = Infinity;
      queue.clearQueue();
      store.clear();
      const own: Record<string, string> = {};
      queue.adoptQueue("member-a");
      own["member-a"] = queue.enqueueRequest(body, "key-a")!.id;
      queue.adoptQueue("member-b");
      own["member-b"] = queue.enqueueRequest(body, "key-b")!.id;
      writesLeft = writes;
      let stopped = false;
      try {
        queue.adoptQueue("member-a");
      } catch (error) {
        if (!(error instanceof Error) || error.message !== STOPPED) throw error;
        stopped = true;
      }
      writesLeft = Infinity;
      const other = next === "member-a" ? "member-b" : "member-a";
      for (const member of [next, other, next]) {
        queue.adoptQueue(member);
        expect(queue.listQueued().map((q) => q.id)).toEqual([own[member]]);
      }
      return stopped;
    }
    let writes = 0;
    while (stoppedAt(writes, "member-a") && stoppedAt(writes, "member-b")) writes += 1;
    // Five writes in that sign-in: B's set aside, the queue emptied, the owner, A's back, A's set-aside gone.
    expect(writes).toBe(5);
  });
});
