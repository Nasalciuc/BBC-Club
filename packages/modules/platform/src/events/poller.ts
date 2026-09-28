import { fenceExecutor } from "./fence";
import { sql } from "drizzle-orm";
import { eventDlq } from "../infrastructure/schema";
import type { EventRegistry } from "./registry";
import { query, type Db, type Executor } from "@bbc/db";
import { z } from "zod";
import type { HandlerTx } from "@bbc/shared/module-contract";

const BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 600_000, 1_800_000]; // 6 retries, then dead
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

export type PollerDeps = {
  logger: {
    info: (o: object, m?: string) => void;
    warn: (o: object, m?: string) => void;
    error: (o: object, m?: string) => void;
  };
  metrics?: {
    inc(n: string, l?: Record<string, string>): void;
    observe(n: string, v: number, l?: Record<string, string>): void;
  };
  /** Consumer-level pause (killswitch without deploy). */
  isPaused?: (consumer: string) => Promise<boolean>;
};
export type PollerOptions = {
  batchSize?: number;
  idleMs?: number;
  busyMs?: number;
  handlerTimeoutMs?: number;
  onDead?: (d: { consumer: string; eventId: string; error: string }) => void;
  /** Deliveries claimed per transaction (default 50). */
  claimBatch?: number;
  /** Stop starting new deliveries in a batch after this long (default 2 000 ms). */
  batchBudgetMs?: number;
};

/** A claimed delivery joined to its event. Raw execute() through Drizzle returns int8 and timestamptz as text. */
const ClaimedDelivery = z.object({
  id: z.string(),
  event_id: z.string(),
  event_occurred_at: z.string(),
  consumer: z.string(),
  attempts: z.number().int(),
  type: z.string(),
  version: z.number().int(),
  aggregate_type: z.string(),
  aggregate_id: z.string(),
  member_id: z.string().nullable(),
  payload: z.unknown(),
  occurred_at: z.coerce.date(), // HandlerContext promises a Date; it used to receive the text
});
type Delivery = z.infer<typeof ClaimedDelivery>;

export function createPoller(db: Db, registry: EventRegistry, deps: PollerDeps, opts: PollerOptions = {}) {
  const idleMs = opts.idleMs ?? 250;
  const busyMs = opts.busyMs ?? 0;
  const handlerTimeoutMs = opts.handlerTimeoutMs ?? 30_000;
  let running = false,
    stopped = false;

  class HandlerTimeout extends Error {}
  const CLAIM_BATCH = opts.claimBatch ?? 50;
  const BATCH_BUDGET_MS = opts.batchBudgetMs ?? 2_000;

  /** Everything a delivery does after it is claimed: paused → park; no handler → dead; handler → done.
   *  Throws the handler's error (the caller decides how to roll back). A timeout throws HandlerTimeout. */
  async function deliver(exec: Executor, row: Delivery): Promise<void> {
    if (deps.isPaused && (await deps.isPaused(row.consumer))) {
      await exec.execute(sql`UPDATE platform.event_deliveries SET status='paused' WHERE id = ${row.id}`);
      return;
    }

    const attempt = row.attempts + 1;
    const handler = registry.handlerFor(row.type, row.consumer);
    if (!handler) {
      // module removed or consumer renamed → park, don't spin
      await exec.execute(
        sql`UPDATE platform.event_deliveries SET status='dead', attempts=${attempt}, last_error='handler not registered', processed_at=now() WHERE id = ${row.id}`,
      );
      await exec.insert(eventDlq).values({
        deliveryId: BigInt(row.id),
        eventId: BigInt(row.event_id),
        consumer: row.consumer,
        attempts: attempt,
        lastError: "handler not registered",
      });
      deps.logger.error({ consumer: row.consumer, type: row.type }, "delivery has no handler");
      return;
    }

    const started = Date.now();
    const fence = fenceExecutor(exec);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), handlerTimeoutMs);
    try {
      const payload = registry.parse(row.type, row.version, row.payload); // upcast + validate
      await Promise.race([
        handler(
          {
            tx: fence.exec as unknown as HandlerTx, // the contract a handler sees; the fence is the real executor
            deliveryId: String(row.id),
            event: {
              id: String(row.event_id),
              type: row.type,
              version: row.version,
              aggregateType: row.aggregate_type,
              aggregateId: row.aggregate_id,
              memberId: row.member_id,
              occurredAt: row.occurred_at,
            },
            principal: {
              kind: "system",
              role: "system",
              source: "handler",
              actorMemberId: row.member_id ?? undefined,
            },
            logger: deps.logger,
            attempt,
            signal: ac.signal,
          },
          payload,
        ),
        abortedPromise(ac.signal, `${row.consumer} timed out after ${handlerTimeoutMs}ms`),
      ]);

      await exec.execute(
        sql`UPDATE platform.event_deliveries SET status='done', attempts=${attempt}, processed_at=now(), last_error=NULL WHERE id = ${row.id}`,
      );
      deps.metrics?.observe("delivery_duration_ms", Date.now() - started, { consumer: row.consumer });
      deps.metrics?.inc("deliveries_done", { consumer: row.consumer });
      return;
    } catch (e: any) {
      if (ac.signal.aborted) throw new HandlerTimeout(String(e?.message ?? e));
      throw e;
    } finally {
      fence.close(); // success, error or timeout: this handler's executor is dead from here on
      clearTimeout(timer);
    }
  }

  type DeadNotice = { consumer: string; eventId: string; error: string };

  /** attempts++ with backoff, or dead + DLQ. Never calls onDead — the caller does that after COMMIT. */
  async function recordFailure(
    exec: Executor,
    row: Delivery,
    attempt: number,
    message: string,
  ): Promise<DeadNotice | null> {
    if (attempt >= MAX_ATTEMPTS) {
      await exec.execute(
        sql`UPDATE platform.event_deliveries SET status='dead', attempts=${attempt}, last_error=${message}, processed_at=now() WHERE id = ${row.id}`,
      );
      await exec.insert(eventDlq).values({
        deliveryId: BigInt(row.id),
        eventId: BigInt(row.event_id),
        consumer: row.consumer,
        attempts: attempt,
        lastError: message,
      });
      deps.logger.error(
        { consumer: row.consumer, eventId: String(row.event_id), attempts: attempt, err: message },
        "delivery dead",
      );
      deps.metrics?.inc("deliveries_dead", { consumer: row.consumer });
      return { consumer: row.consumer, eventId: String(row.event_id), error: message };
    }
    const delay = BACKOFF_MS[attempt - 1] ?? 1_000;
    await exec.execute(
      sql`UPDATE platform.event_deliveries SET attempts=${attempt}, last_error=${message}, run_after = now() + ${delay} * interval '1 millisecond' WHERE id = ${row.id}`,
    );
    deps.logger.warn({ consumer: row.consumer, attempt, retryInMs: delay, err: message }, "delivery retry");
    deps.metrics?.inc("deliveries_retried", { consumer: row.consumer });
    return null;
  }

  /** Last resort when recording the real failure itself fails. Keeps the row off the immediate retry loop. */
  async function bumpRunAfter(exec: Executor, id: string, message: string): Promise<void> {
    await exec.execute(sql`
      UPDATE platform.event_deliveries
      SET attempts = attempts + 1,
          run_after = now() + interval '5 minutes',
          last_error = left(${message}, 1000)
      WHERE id = ${id}`);
  }

  async function notifyDead(notices: readonly DeadNotice[]): Promise<void> {
    for (const n of notices) {
      try {
        await opts.onDead?.(n);
      } catch (err) {
        deps.logger.error({ err, consumer: n.consumer, eventId: n.eventId }, "events.dead.notify_failed");
      }
    }
  }

  const CLAIM_SQL = (limit: number) => sql`
        SELECT d.id, d.event_id, d.event_occurred_at, d.consumer, d.attempts,
               e.type, e.version, e.aggregate_type, e.aggregate_id, e.member_id, e.payload, e.occurred_at
        FROM platform.event_deliveries d
        JOIN platform.domain_events e ON e.id = d.event_id AND e.occurred_at = d.event_occurred_at
        WHERE d.status = 'pending' AND d.run_after <= now()
        ORDER BY d.run_after, d.id
        FOR UPDATE OF d SKIP LOCKED
        LIMIT ${limit}`;

  /** One delivery per transaction (kept for callers and tests that drive the poller one step at a time). */
  async function processOne(): Promise<"done" | "empty"> {
    let failed: { row: Delivery; attempt: number; message: string } | null = null;
    const outcome = await db
      .transaction(async (tx) => {
        const [row] = await query(tx, CLAIM_SQL(1), ClaimedDelivery);
        if (!row) return "empty" as const;
        try {
          await deliver(tx, row);
          return "done" as const;
        } catch (e: any) {
          failed = { row, attempt: row.attempts + 1, message: String(e?.message ?? e).slice(0, 1000) };
          throw e;
        }
      })
      .catch((e: any) => {
        if (!failed) throw e;
        return "failed" as const;
      });
    if (outcome !== "failed") return outcome;
    const f = failed as unknown as { row: Delivery; attempt: number; message: string };
    let notice: DeadNotice | null = null;
    try {
      notice = await db.transaction(async (tx) => recordFailure(tx, f.row, f.attempt, f.message));
    } catch (writeErr) {
      deps.logger.error({ err: writeErr, deliveryId: String(f.row.id) }, "events.record_failure");
      await db.transaction(async (tx) => bumpRunAfter(tx, f.row.id, f.message));
    }
    if (notice) await notifyDead([notice]);
    return "done";
  }

  /** Up to CLAIM_BATCH deliveries in ONE transaction, each inside a SAVEPOINT. A handler error rolls back only its
   *  savepoint and is recorded in the batch transaction (never on another connection: the row is locked by this
   *  transaction and a second connection would wait on it). A TIMEOUT aborts the whole batch: the abandoned handler
   *  may still be running and must not write into a live transaction; the batch is retried, the timeout recorded after. */
  async function processBatch(): Promise<number> {
    let timedOut: { row: Delivery; attempt: number; message: string } | null = null;
    let processed = 0;
    const dead: DeadNotice[] = [];
    try {
      await db.transaction(async (tx) => {
        const rows = await query(tx, CLAIM_SQL(CLAIM_BATCH), ClaimedDelivery);
        const deadline = Date.now() + BATCH_BUDGET_MS;
        for (const row of rows) {
          if (stopped || Date.now() > deadline) break; // untouched rows stay pending, released at COMMIT
          try {
            await tx.transaction(async (sp) => deliver(sp, row)); // SAVEPOINT
          } catch (e: any) {
            const message = String(e?.message ?? e).slice(0, 1000);
            if (e instanceof HandlerTimeout) {
              timedOut = { row, attempt: row.attempts + 1, message };
              throw e;
            }
            try {
              const notice = await tx.transaction(async (sp) => recordFailure(sp, row, row.attempts + 1, message));
              if (notice) dead.push(notice);
            } catch (writeErr) {
              deps.logger.error({ err: writeErr, deliveryId: String(row.id) }, "events.record_failure");
              await tx.transaction(async (sp) => bumpRunAfter(sp, row.id, message));
            }
          }
          processed++;
        }
      });
    } catch (e: any) {
      dead.length = 0;
      if (!timedOut) throw e;
      processed = 0;
    }
    if (timedOut) {
      const t = timedOut as unknown as { row: Delivery; attempt: number; message: string };
      let notice: DeadNotice | null = null;
      try {
        notice = await db.transaction(async (tx) => recordFailure(tx, t.row, t.attempt, t.message));
      } catch (writeErr) {
        deps.logger.error({ err: writeErr, deliveryId: String(t.row.id) }, "events.record_failure");
        await db.transaction(async (tx) => bumpRunAfter(tx, t.row.id, t.message));
      }
      if (notice) await notifyDead([notice]);
      return 1;
    }
    await notifyDead(dead);
    return processed;
  }

  /** Process everything currently due, then return the count. Tests and the pre-deploy drain use this. */
  async function drainOnce(limit = 10_000): Promise<number> {
    let n = 0;
    while (n < limit) {
      const k = await processBatch();
      if (k === 0) break;
      n += k;
    }
    return n;
  }

  async function loop() {
    running = true;
    while (!stopped) {
      let processed = 0;
      try {
        processed = await processBatch();
      } catch (e) {
        deps.logger.error({ err: String(e) }, "poller tick failed");
        await sleep(5_000);
      }
      await sleep(processed === 0 ? idleMs : busyMs);
    }
    running = false;
  }

  return {
    start: () => {
      stopped = false;
      void loop();
    },
    stop: async () => {
      stopped = true;
      for (let i = 0; i < 100 && running; i++) await sleep(50);
    },
    drainOnce,
    processOne,
    /** Operator action: requeue a dead delivery after fixing the cause. */
    replay: async (deliveryId: string) =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE platform.event_deliveries SET status='pending', attempts=0, run_after=now(), last_error=NULL WHERE id = ${deliveryId}`,
        );
        await tx.execute(sql`DELETE FROM platform.event_dlq WHERE delivery_id = ${deliveryId}`);
      }),
    /** Resume everything a pause left behind. */
    resume: async (consumer: string) =>
      db.execute(
        sql`UPDATE platform.event_deliveries SET status='pending', run_after=now() WHERE consumer=${consumer} AND status='paused'`,
      ),
    /** Queue health for /metrics and alerts: age of the oldest pending delivery is the number that matters. */
    stats: async () => {
      const [r] = await query(
        db,
        sql`
    SELECT (SELECT count(*) FROM platform.event_deliveries WHERE status = 'pending')::int AS pending,
           (SELECT count(*) FROM platform.event_deliveries WHERE status = 'dead')::int    AS dead,
           (SELECT count(*) FROM platform.event_deliveries WHERE status = 'paused')::int  AS paused,
           COALESCE(EXTRACT(EPOCH FROM now() - (SELECT min(created_at) FROM platform.event_deliveries
                                                WHERE status = 'pending'))::int, 0)      AS oldest_pending_s`,
        QueueStats,
      );
      if (!r) throw new Error("poller.stats returned no row");
      return { pending: r.pending, dead: r.dead, paused: r.paused, oldestPendingSeconds: r.oldest_pending_s };
    },
  };
}

const QueueStats = z.object({
  pending: z.number().int(),
  dead: z.number().int(),
  paused: z.number().int(),
  oldest_pending_s: z.number().int(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function abortedPromise(signal: AbortSignal, msg: string): Promise<never> {
  return new Promise((_, rej) => {
    if (signal.aborted) {
      rej(new Error(msg));
      return;
    }
    signal.addEventListener("abort", () => rej(new Error(msg)), { once: true });
  });
}
