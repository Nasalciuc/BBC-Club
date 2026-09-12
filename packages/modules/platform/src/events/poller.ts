import { sql } from "drizzle-orm";
import { eventDlq } from "../infrastructure/schema";
import type { EventRegistry } from "./registry";

const BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 600_000, 1_800_000];   // 6 retries, then dead
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

export type PollerDeps = {
  logger: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void; error: (o: object, m?: string) => void };
  metrics?: { inc(n: string, l?: Record<string, string>): void; observe(n: string, v: number, l?: Record<string, string>): void };
  /** Consumer-level pause (killswitch without deploy). */
  isPaused?: (consumer: string) => Promise<boolean>;
};
export type PollerOptions = {
  batchSize?: number; idleMs?: number; busyMs?: number; handlerTimeoutMs?: number;
  onDead?: (d: { consumer: string; eventId: string; error: string }) => void;
};

export function createPoller(db: any, registry: EventRegistry, deps: PollerDeps, opts: PollerOptions = {}) {
  const batchSize = opts.batchSize ?? 100;
  const idleMs = opts.idleMs ?? 250;
  const busyMs = opts.busyMs ?? 0;
  const handlerTimeoutMs = opts.handlerTimeoutMs ?? 30_000;
  let running = false, stopped = false;

  /** Claim one delivery (SKIP LOCKED), run the handler and mark the delivery in the SAME transaction.
   *  Failure path runs in its own transaction so the handler's writes are rolled back first. */
  async function processOne(): Promise<"done" | "empty"> {
    let failure: { row: any; attempt: number; message: string } | null = null;

    const outcome = await db.transaction(async (tx: any) => {
      const rows: any[] = await tx.execute(sql`
        SELECT d.id, d.event_id, d.event_occurred_at, d.consumer, d.attempts,
               e.type, e.version, e.aggregate_type, e.aggregate_id, e.member_id, e.payload, e.occurred_at
        FROM platform.event_deliveries d
        JOIN platform.domain_events e ON e.id = d.event_id AND e.occurred_at = d.event_occurred_at
        WHERE d.status = 'pending' AND d.run_after <= now()
        ORDER BY d.id
        FOR UPDATE OF d SKIP LOCKED
        LIMIT 1`);
      const row = rows[0];
      if (!row) return "empty" as const;

      if (deps.isPaused && (await deps.isPaused(row.consumer))) {
        await tx.execute(sql`UPDATE platform.event_deliveries SET status='paused' WHERE id = ${row.id}`);
        return "done" as const;
      }

      const attempt = row.attempts + 1;
      const handler = registry.handlerFor(row.type, row.consumer);
      if (!handler) {                                   // module removed or consumer renamed → park, don't spin
        await tx.execute(sql`UPDATE platform.event_deliveries SET status='dead', attempts=${attempt}, last_error='handler not registered', processed_at=now() WHERE id = ${row.id}`);
        await tx.insert(eventDlq).values({ deliveryId: row.id, eventId: row.event_id, consumer: row.consumer, attempts: attempt, lastError: "handler not registered" });
        deps.logger.error({ consumer: row.consumer, type: row.type }, "delivery has no handler");
        return "done" as const;
      }

      const started = Date.now();
      try {
        const payload = registry.parse(row.type, row.version, row.payload);      // upcast + validate
        await withTimeout(handler({
          tx,
          event: { id: String(row.event_id), type: row.type, version: row.version, aggregateType: row.aggregate_type, aggregateId: row.aggregate_id, memberId: row.member_id, occurredAt: row.occurred_at },
          principal: { kind: "system", role: "system", source: "handler", actorMemberId: row.member_id ?? undefined },
          logger: deps.logger, attempt,
        }, payload), handlerTimeoutMs, `${row.consumer} timed out after ${handlerTimeoutMs}ms`);

        await tx.execute(sql`UPDATE platform.event_deliveries SET status='done', attempts=${attempt}, processed_at=now(), last_error=NULL WHERE id = ${row.id}`);
        deps.metrics?.observe("delivery_duration_ms", Date.now() - started, { consumer: row.consumer });
        deps.metrics?.inc("deliveries_done", { consumer: row.consumer });
        return "done" as const;
      } catch (e: any) {
        failure = { row, attempt, message: String(e?.message ?? e).slice(0, 1000) };
        throw e;                                          // roll back handler writes
      }
    }).catch((e: any) => { if (!failure) throw e; return "failed" as const; });

    if (outcome !== "failed") return outcome;

    const { row, attempt, message } = failure!;
    if (attempt >= MAX_ATTEMPTS) {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql`UPDATE platform.event_deliveries SET status='dead', attempts=${attempt}, last_error=${message}, processed_at=now() WHERE id = ${row.id}`);
        await tx.insert(eventDlq).values({ deliveryId: row.id, eventId: row.event_id, consumer: row.consumer, attempts: attempt, lastError: message });
      });
      deps.logger.error({ consumer: row.consumer, eventId: String(row.event_id), attempts: attempt, err: message }, "delivery dead");
      deps.metrics?.inc("deliveries_dead", { consumer: row.consumer });
      opts.onDead?.({ consumer: row.consumer, eventId: String(row.event_id), error: message });
    } else {
      const delay = BACKOFF_MS[attempt - 1] ?? 1_000;
      await db.execute(sql`UPDATE platform.event_deliveries SET attempts=${attempt}, last_error=${message}, run_after = now() + ${delay} * interval '1 millisecond' WHERE id = ${row.id}`);
      deps.logger.warn({ consumer: row.consumer, attempt, retryInMs: delay, err: message }, "delivery retry");
      deps.metrics?.inc("deliveries_retried", { consumer: row.consumer });
    }
    return "done";
  }

  /** Process everything currently due, then return the count. Tests and the pre-deploy drain use this. */
  async function drainOnce(limit = 10_000): Promise<number> {
    let n = 0;
    for (; n < limit; n++) if ((await processOne()) === "empty") break;
    return n;
  }

  async function loop() {
    running = true;
    while (!stopped) {
      let processed = 0;
      try {
        for (let i = 0; i < batchSize && !stopped; i++) {
          if ((await processOne()) === "empty") break;
          processed++;
        }
      } catch (e) {
        deps.logger.error({ err: String(e) }, "poller tick failed");
        await sleep(5_000);
      }
      await sleep(processed === 0 ? idleMs : busyMs);
    }
    running = false;
  }

  return {
    start: () => { stopped = false; void loop(); },
    stop: async () => { stopped = true; for (let i = 0; i < 100 && running; i++) await sleep(50); },
    drainOnce,
    processOne,
    /** Operator action: requeue a dead delivery after fixing the cause. */
    replay: async (deliveryId: string) => db.transaction(async (tx: any) => {
      await tx.execute(sql`UPDATE platform.event_deliveries SET status='pending', attempts=0, run_after=now(), last_error=NULL WHERE id = ${deliveryId}`);
      await tx.execute(sql`DELETE FROM platform.event_dlq WHERE delivery_id = ${deliveryId}`);
    }),
    /** Resume everything a pause left behind. */
    resume: async (consumer: string) =>
      db.execute(sql`UPDATE platform.event_deliveries SET status='pending', run_after=now() WHERE consumer=${consumer} AND status='paused'`),
    /** Queue health for /metrics and alerts: age of the oldest pending delivery is the number that matters. */
    stats: async () => {
      const rows: any[] = await db.execute(sql`
        SELECT count(*) FILTER (WHERE status='pending')::int AS pending,
               count(*) FILTER (WHERE status='dead')::int AS dead,
               count(*) FILTER (WHERE status='paused')::int AS paused,
               COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (WHERE status='pending')))::int, 0) AS oldest_pending_s
        FROM platform.event_deliveries`);
      const r = rows[0];
      return { pending: r.pending, dead: r.dead, paused: r.paused, oldestPendingSeconds: r.oldest_pending_s };
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let t: any;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); }),
  ]);
}
