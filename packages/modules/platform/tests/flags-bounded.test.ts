/** ADR-IMPL-080: a kill or pause check never waits without limit. The server stops the counters' read at its
 *  statement_timeout, but a read can also wait for a pooled connection, a connect, or a connection that stopped
 *  answering — and the flags' minute reload can wait as long. The check answers within a second all the same: from what
 *  is held while it can be trusted, "unknown" (OVERLOADED) once it cannot. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Socket } from "bun";
import { createDb } from "@bbc/db";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createGenerations } from "../src/generations";
import { createFlags } from "../src/flags";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("platform-flags-bounded", { max: 1 });
});
afterAll(() => iso.drop());

/** Within a second, or "still waiting": a bounded wait is 600 ms (the read's 500 ms and 100 ms). */
const within = <T>(p: Promise<T>, ms = 1_500) => Promise.race([p, Bun.sleep(ms).then(() => "still waiting" as const)]);

/** A TCP relay to Postgres that, once frozen, passes nothing either way: a connection that stopped answering. */
function freezable(url: string) {
  const target = new URL(url);
  let frozen = false;
  type Side = { up?: Socket<undefined>; queued: Uint8Array[] };
  const relay = Bun.listen<Side>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      async open(client) {
        client.data = { queued: [] };
        client.data.up = await Bun.connect({
          hostname: target.hostname === "localhost" ? "127.0.0.1" : target.hostname,
          port: Number(target.port || 5432),
          socket: {
            data(_s, d) {
              if (!frozen) client.write(d);
            },
            close() {
              client.end();
            },
          },
        });
        for (const b of client.data.queued) client.data.up.write(b);
      },
      data(client, d) {
        if (frozen) return;
        if (client.data.up) client.data.up.write(d);
        else client.data.queued.push(new Uint8Array(d));
      },
      close(client) {
        client.data.up?.end();
      },
    },
  });
  const u = new URL(url);
  u.hostname = "127.0.0.1";
  u.port = String(relay.port);
  return {
    url: u.toString(),
    freeze: () => {
      frozen = true;
    },
    stop: () => relay.stop(true),
  };
}

describe("a kill check never waits without limit (ADR-IMPL-080)", () => {
  it("counters 6 s old and every pooled connection busy: it answers from what is held within a second", async () => {
    const db = createDb(iso.url, { max: 1 });
    let clock = 1_000_000;
    const flags = createFlags(db, { generations: createGenerations(db, { now: () => clock }), now: () => clock });
    expect(await flags.killedState("catalog")).toBe("live");
    // The pool's only connection is held (a slow query, a long transaction): the counters' read waits for the pool,
    // where statement_timeout does not reach.
    const release = Promise.withResolvers<void>();
    const busy = db.transaction(async () => {
      await release.promise;
    });
    try {
      clock += 6_000; // past GENERATIONS_WAIT_WHEN_STALE_MS: the caller waits for the read, but not for the pool
      expect(await within(flags.killedState("catalog"))).toBe("live");
    } finally {
      release.resolve();
      await busy;
      await db.close();
    }
  }, 20_000);

  it("a connection that stopped answering: every caller answers within a second, unknown past KILL_STALE_MS", async () => {
    const relay = freezable(iso.url);
    const db = createDb(relay.url, { max: 2 });
    let clock = 2_000_000;
    const g = createGenerations(db, { now: () => clock });
    const flags = createFlags(db, { generations: g, now: () => clock });
    try {
      expect(await flags.killedState("catalog")).toBe("live");
      relay.freeze();
      clock += 6_000;
      const first = within(flags.killedState("catalog"));
      clock += 5_000; // later callers, the counters now 11 s old
      const later = [0, 1, 2].map(() => within(flags.killedState("catalog")));
      expect(await first).not.toBe("still waiting");
      expect(await Promise.all(later)).toEqual(["unknown", "unknown", "unknown"]);
      expect(g.staleMs()).toBeGreaterThan(10_000);
    } finally {
      relay.stop();
      await db.close().catch(() => {});
    }
  }, 30_000);

  it("a new replica whose Postgres stopped answering says unknown within a second, nothing held", async () => {
    const relay = freezable(iso.url);
    const db = createDb(relay.url, { max: 2 });
    try {
      relay.freeze(); // nothing passes: the first read's connect and its query wait as long as the connection
      const flags = createFlags(db);
      expect(await within(flags.killedState("catalog"), 2_000)).toBe("unknown");
      expect(await within(flags.consumerPauseState("testing.onAny"), 2_000)).toBe("unknown");
    } finally {
      relay.stop();
      await db.close().catch(() => {});
    }
  }, 30_000);

  it("past the flags' minute with healthy counters, a kill check does not wait for the flags table", async () => {
    const db = createDb(iso.url, { max: 1 });
    const healthy = createDb(iso.url, { max: 1 }); // the counters answer at once
    let clock = 3_000_000;
    const flags = createFlags(db, { generations: createGenerations(healthy, { now: () => clock }), now: () => clock });
    expect(await flags.killedState("catalog")).toBe("live");
    const release = Promise.withResolvers<void>();
    const busy = db.transaction(async () => {
      await release.promise;
    });
    try {
      clock += 61_000; // the snapshot's maxAgeMs has passed: it loads again, behind the callers
      expect(await within(flags.killedState("catalog"), 1_000)).toBe("live");
      expect(await within(flags.isEnabled("bounded.feature", true), 1_000)).toBe(true);
    } finally {
      release.resolve();
      await busy;
      await db.close();
      await healthy.close();
    }
  }, 20_000);
});
