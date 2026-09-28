import { sql } from "drizzle-orm";
import postgres from "postgres";
import { loadEnv } from "@bbc/shared/env";
import type { Db } from "@bbc/db";
import type { Metrics } from "../telemetry/metrics";

const ConnRow = {
  parse(rows: unknown): { app: string; state: string; n: number }[] {
    return (rows as { app: string; state: string; n: number }[]).map((r) => ({
      app: String(r.app),
      state: String(r.state),
      n: Number(r.n),
    }));
  },
};

export type DbSnapshot = {
  connections: { app: string; state: string; n: number }[];
  oldestTx: { app: string; s: number }[];
  lockWaits: number;
  deadlocks: number;
  /** null when SHOW POOLS failed. 0 means not configured or no clients waiting. */
  poolWaiting: number | null;
  oldestTxSeconds: number;
};

export type DbReport = {
  generatedAt: string;
  statsReset: string | null;
  statsAgeDays: number | null;
  meaningfulAfterDays: number;
  slowestByMean: unknown[];
  slowestByTotal: unknown[];
  unusedIndexes: unknown[];
  deadliestTables: unknown[];
};

let waitingSince: number | null = null;
let oldestAlerted = false;

/** Tests only — module-level alert windows must not leak across cases. */
export function resetDbAlertState() {
  waitingSince = null;
  oldestAlerted = false;
}

export async function collectDbSnapshot(db: Db): Promise<DbSnapshot> {
  const connections = ConnRow.parse(
    await db.execute(
      sql.raw(`
      SELECT coalesce(nullif(application_name, ''), 'unknown') AS app, coalesce(state, 'unknown') AS state, count(*)::int AS n
      FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() GROUP BY 1, 2`),
    ),
  );
  const oldestTx = (
    (await db.execute(
      sql.raw(`
      SELECT coalesce(nullif(application_name, ''), 'unknown') AS app,
             coalesce(max(extract(epoch FROM now() - xact_start))::int, 0) AS s
      FROM pg_stat_activity WHERE datname = current_database() AND xact_start IS NOT NULL GROUP BY 1`),
    )) as {
      app: string;
      s: number;
    }[]
  ).map((r) => ({ app: String(r.app), s: Number(r.s) }));
  const lockRows = (await db.execute(sql.raw(`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted`))) as {
    n: number;
  }[];
  const deadlockRows = (await db.execute(
    sql.raw(`SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()`),
  )) as { n: number }[];
  const poolWaiting = await pgbouncerWaiting();
  const oldestTxSeconds = oldestTx.reduce((m, r) => Math.max(m, r.s), 0);
  return {
    connections,
    oldestTx,
    lockWaits: Number(lockRows[0]?.n ?? 0),
    deadlocks: Number(deadlockRows[0]?.n ?? 0),
    poolWaiting,
    oldestTxSeconds,
  };
}

async function pgbouncerWaiting(): Promise<number | null> {
  const env = loadEnv();
  const url = env.PGBOUNCER_ADMIN_URL;
  if (!url) return 0;
  const c = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 3,
    connection: { application_name: "bbc-pgbouncer-stats" },
    onnotice: () => {},
  });
  try {
    const rows = (await c.unsafe("SHOW POOLS")) as { cl_waiting?: number | string }[];
    return rows.reduce((sum, r) => sum + Number(r.cl_waiting ?? 0), 0);
  } catch {
    return null;
  } finally {
    await c.end({ timeout: 1 }).catch(() => {});
  }
}

export function applyDbGauges(metrics: Metrics, snap: DbSnapshot) {
  metrics.clearPrefix("db_connections");
  metrics.clearPrefix("db_oldest_tx_seconds");
  for (const r of snap.connections) metrics.setGauge("db_connections", r.n, { app: r.app, state: r.state });
  for (const r of snap.oldestTx) metrics.setGauge("db_oldest_tx_seconds", r.s, { app: r.app });
  metrics.setGauge("db_lock_waits", snap.lockWaits);
  metrics.setGauge("db_deadlocks_total", snap.deadlocks);
  if (snap.poolWaiting == null) metrics.clearPrefix("pgbouncer_waiting_clients");
  else metrics.setGauge("pgbouncer_waiting_clients", snap.poolWaiting);
}

export async function maybeAlertOps(
  snap: DbSnapshot,
  logger: { warn: (o: object, m?: string) => void },
  now = Date.now(),
  signal?: AbortSignal,
): Promise<number> {
  const env = loadEnv();
  const hook = env.OPS_WEBHOOK;
  const delivery = signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
  let posted = 0;
  if (snap.poolWaiting == null) {
    logger.warn({}, "pgbouncer SHOW POOLS failed; waiting window unchanged");
  } else if (snap.poolWaiting > 0) {
    waitingSince ??= now;
  } else {
    waitingSince = null;
  }
  const waitingMs = waitingSince ? now - waitingSince : 0;
  if (hook && snap.poolWaiting != null && waitingMs >= 120_000) {
    await postOps(hook, `pool_waiting=${snap.poolWaiting} for ${Math.round(waitingMs / 1000)}s`, delivery);
    posted++;
    waitingSince = now;
  }
  if (snap.oldestTxSeconds > 30) {
    if (hook && !oldestAlerted) {
      await postOps(hook, `oldest_tx=${snap.oldestTxSeconds}s (> 30s)`, delivery);
      posted++;
      oldestAlerted = true;
    }
  } else {
    oldestAlerted = false;
  }
  if (posted === 0 && (snap.poolWaiting > 0 || snap.oldestTxSeconds > 30)) {
    logger.warn(
      { poolWaiting: snap.poolWaiting, oldestTxSeconds: snap.oldestTxSeconds },
      "db threshold crossed (OPS_WEBHOOK unset — not posted)",
    );
  }
  return posted;
}

async function postOps(url: string, text: string, signal: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `[bbc db] ${text}` }),
    signal,
  });
  if (!res.ok) throw new Error(`OPS_WEBHOOK ${res.status}`);
}

export async function collectDbReport(db: Db): Promise<DbReport> {
  const resetRows = (await db.execute(
    sql.raw(`SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()`),
  )) as { stats_reset: Date | string | null }[];
  const statsReset = resetRows[0]?.stats_reset ? new Date(resetRows[0].stats_reset).toISOString() : null;
  const statsAgeDays = statsReset ? (Date.now() - new Date(statsReset).getTime()) / 86_400_000 : null;

  let slowestByMean: unknown[] = [];
  let slowestByTotal: unknown[] = [];
  try {
    slowestByMean = (await db.execute(
      sql.raw(`
      SELECT queryid::text, calls, mean_exec_time, total_exec_time, left(query, 200) AS query
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      ORDER BY mean_exec_time DESC
      LIMIT 20`),
    )) as unknown[];
    slowestByTotal = (await db.execute(
      sql.raw(`
      SELECT queryid::text, calls, mean_exec_time, total_exec_time, left(query, 200) AS query
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      ORDER BY total_exec_time DESC
      LIMIT 20`),
    )) as unknown[];
  } catch {
    slowestByMean = [];
    slowestByTotal = [];
  }

  const unusedIndexes = (await db.execute(
    sql.raw(`
    SELECT s.schemaname || '.' || s.indexrelname AS idx, s.idx_scan, pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
    FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
    WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
      AND s.schemaname = ANY('{platform,members,notifications,requests,catalog,crm,auth}')
    ORDER BY pg_relation_size(s.indexrelid) DESC LIMIT 20`),
  )) as unknown[];

  const deadliestTables = (await db.execute(
    sql.raw(`
    SELECT schemaname || '.' || relname AS tbl, n_dead_tup, n_live_tup
    FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 20`),
  )) as unknown[];

  return {
    generatedAt: new Date().toISOString(),
    statsReset,
    statsAgeDays,
    meaningfulAfterDays: 7,
    slowestByMean,
    slowestByTotal,
    unusedIndexes,
    deadliestTables,
  };
}
