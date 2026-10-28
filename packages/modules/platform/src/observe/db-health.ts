import { sql } from "drizzle-orm";
import postgres from "postgres";
import { loadEnv } from "@bbc/shared/env";
import { errorForLog, type Db } from "@bbc/db";
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
  /** null when the admin URL is unset or SHOW POOLS failed. A number is cl_waiting. */
  poolWaiting: number | null;
  oldestTxSeconds: number;
  /** PgBouncer's pools and totals (SHOW POOLS, SHOW STATS); null with poolWaiting. */
  pooler?: PoolSample | null;
  /** pg_stat_statements summed over this database since its last reset; null when the extension cannot be read. */
  statements?: StatementTotals | null;
};

/** What every statement of this database has cost since pg_stat_statements was last reset (ADR-IMPL-073). Plans are
 *  null (no series) while `pg_stat_statements.track_planning` is off: a 0 there read as "nothing planned". `dealloc`
 *  counts the times pg_stat_statements dropped its least-run entries to make room, which lowers the sums. */
export type StatementTotals = {
  calls: number;
  plans: number | null;
  execSeconds: number;
  planSeconds: number | null;
  dealloc: number;
};

export type DbReport = {
  generatedAt: string;
  /** `pg_stat_database.stats_reset` only. A single-index reset does not move this timestamp. */
  statsReset: string | null;
  /** `pg_stat_statements_info.stats_reset`. `statsAgeDays` is computed from this. */
  statementsReset: string | null;
  statsAgeDays: number | null;
  meaningfulAfterDays: number;
  slowestByMean: unknown[];
  slowestByTotal: unknown[];
  unusedIndexes: unknown[];
  deadliestTables: unknown[];
};

let waitingSince: number | null = null;
let oldestAlerted = false;

type WarnLog = { warn: (o: object, m?: string) => void };

/** SHOW POOLS summed over every pool, and SHOW STATS summed over every database (ADR-IMPL-073). The parse and bind
 *  counts, from PgBouncer 1.24, show whether prepared statements are reused: a client parse the server did not repeat
 *  is one it kept. `stats` is null when SHOW STATS could not be read; a column the version lacks reads 0. */
export type PoolSample = {
  waiting: number;
  pools: number;
  clientsActive: number;
  serversActive: number;
  serversIdle: number;
  maxWaitSeconds: number;
  stats: {
    transactions: number;
    queries: number;
    waitSeconds: number;
    clientParses: number;
    serverParses: number;
    binds: number;
  } | null;
};

/** Tests only — module-level alert windows must not leak across cases. */
export function resetDbAlertState() {
  waitingSince = null;
  oldestAlerted = false;
}

export async function collectDbSnapshot(db: Db, logger: WarnLog): Promise<DbSnapshot> {
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
  const pooler = await pgbouncerSample(logger);
  const oldestTxSeconds = oldestTx.reduce((m, r) => Math.max(m, r.s), 0);
  return {
    connections,
    oldestTx,
    lockWaits: Number(lockRows[0]?.n ?? 0),
    deadlocks: Number(deadlockRows[0]?.n ?? 0),
    poolWaiting: pooler?.waiting ?? null,
    oldestTxSeconds,
    pooler,
    statements: await statementTotals(db),
  };
}

async function pgbouncerSample(logger: WarnLog): Promise<PoolSample | null> {
  const url = loadEnv().PGBOUNCER_ADMIN_URL;
  if (!url) return null;
  return pgbouncerWaitingClients(url, logger);
}

/** One row for the whole database: the totals Grafana divides by the requests (ADR-IMPL-073). */
async function statementTotals(db: Db): Promise<StatementTotals | null> {
  try {
    const [row] = (await db.execute(
      sql.raw(`
      SELECT coalesce(sum(calls), 0)::float8 AS calls,
             CASE WHEN current_setting('pg_stat_statements.track_planning', true) = 'on'
                  THEN coalesce(sum(plans), 0)::float8 END AS plans,
             coalesce(sum(total_exec_time), 0)::float8 AS exec_ms,
             CASE WHEN current_setting('pg_stat_statements.track_planning', true) = 'on'
                  THEN coalesce(sum(total_plan_time), 0)::float8 END AS plan_ms,
             (SELECT dealloc FROM pg_stat_statements_info)::float8 AS dealloc
      FROM pg_stat_statements(false) WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`),
    )) as { calls: number; plans: number | null; exec_ms: number; plan_ms: number | null; dealloc: number | null }[];
    if (!row) return null;
    return {
      calls: Number(row.calls),
      plans: row.plans == null ? null : Number(row.plans),
      execSeconds: Number(row.exec_ms) / 1000,
      planSeconds: row.plan_ms == null ? null : Number(row.plan_ms) / 1000,
      dealloc: Number(row.dealloc ?? 0),
    };
  } catch {
    return null;
  }
}

/** SHOW POOLS and SHOW STATS on the PgBouncer admin console. fetch_types stays off: the console rejects the extended
 *  protocol. */
export async function pgbouncerWaitingClients(url: string, logger: WarnLog): Promise<PoolSample | null> {
  const c = postgres(url, {
    max: 1,
    prepare: false,
    fetch_types: false,
    connect_timeout: 3,
    connection: { application_name: "bbc-pgbouncer-stats" },
    onnotice: () => {},
  });
  try {
    const rows = (await c.unsafe("SHOW POOLS")) as Record<string, number | string | null | undefined>[];
    const sum = (list: Record<string, number | string | null | undefined>[], col: string) =>
      list.reduce((total, r) => total + (Number(r[col] ?? 0) || 0), 0);
    let stats: PoolSample["stats"] = null;
    try {
      const totals = (await c.unsafe("SHOW STATS")) as Record<string, number | string | null | undefined>[];
      stats = {
        transactions: sum(totals, "total_xact_count"),
        queries: sum(totals, "total_query_count"),
        waitSeconds: sum(totals, "total_wait_time") / 1e6,
        clientParses: sum(totals, "total_client_parse_count"),
        serverParses: sum(totals, "total_server_parse_count"),
        binds: sum(totals, "total_bind_count"),
      };
    } catch (err) {
      logger.warn({ err: errorForLog(err) }, "pgbouncer SHOW STATS failed");
    }
    return {
      waiting: sum(rows, "cl_waiting"),
      pools: rows.length,
      clientsActive: sum(rows, "cl_active"),
      serversActive: sum(rows, "sv_active"),
      serversIdle: sum(rows, "sv_idle"),
      maxWaitSeconds: rows.reduce((m, r) => Math.max(m, Number(r.maxwait ?? 0) || 0), 0),
      stats,
    };
  } catch (err) {
    logger.warn({ err: errorForLog(err) }, "pgbouncer SHOW POOLS failed");
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
  const pooler = snap.pooler ?? null;
  const poolGauges = [
    ["pgbouncer_clients_active", pooler?.clientsActive],
    ["pgbouncer_servers_active", pooler?.serversActive],
    ["pgbouncer_servers_idle", pooler?.serversIdle],
    ["pgbouncer_max_wait_seconds", pooler?.maxWaitSeconds],
  ] as const;
  for (const [name, value] of poolGauges) {
    if (value == null) metrics.clearPrefix(name);
    else metrics.setGauge(name, value);
  }
  const stats = pooler?.stats ?? null;
  const poolCounters = [
    ["pgbouncer_transactions_total", stats?.transactions],
    ["pgbouncer_queries_total", stats?.queries],
    ["pgbouncer_wait_seconds_total", stats?.waitSeconds],
    ["pgbouncer_client_parses_total", stats?.clientParses],
    ["pgbouncer_server_parses_total", stats?.serverParses],
    ["pgbouncer_binds_total", stats?.binds],
  ] as const;
  for (const [name, value] of poolCounters) {
    if (value == null) metrics.clearPrefix(name);
    else metrics.setCounter(name, value);
  }
  const st = snap.statements ?? null;
  const statementCounters = [
    ["db_statements_total", st?.calls],
    ["db_statement_plans_total", st?.plans],
    ["db_statement_exec_seconds_total", st?.execSeconds],
    ["db_statement_plan_seconds_total", st?.planSeconds],
  ] as const;
  // The sums drop when pg_stat_statements makes room (dealloc) — a drop a rate reads as a reset, and so a spike. The
  // series carry dealloc as `epoch`: each eviction starts new ones, which sum(rate(…)) adds without a jump.
  for (const [name, value] of statementCounters) {
    metrics.clearPrefix(name);
    if (value != null && st) metrics.setCounter(name, value, { epoch: String(st.dealloc) });
  }
}

export async function maybeAlertOps(
  snap: DbSnapshot,
  logger: WarnLog,
  now = Date.now(),
  signal?: AbortSignal,
): Promise<number> {
  const env = loadEnv();
  const hook = env.OPS_WEBHOOK;
  const delivery = signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
  const waiting = snap.poolWaiting;
  let posted = 0;
  if (waiting != null) {
    if (waiting > 0) waitingSince ??= now;
    else waitingSince = null;
  }
  const waitingMs = waitingSince ? now - waitingSince : 0;
  if (hook && waiting != null && waiting > 0 && waitingMs >= 120_000) {
    await postOps(hook, `pool_waiting=${waiting} for ${Math.round(waitingMs / 1000)}s`, delivery);
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
  if (posted === 0 && ((waiting != null && waiting > 0) || snap.oldestTxSeconds > 30)) {
    logger.warn(
      { poolWaiting: waiting, oldestTxSeconds: snap.oldestTxSeconds },
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

  let statementsReset: string | null = null;
  try {
    const infoRows = (await db.execute(sql.raw(`SELECT stats_reset FROM pg_stat_statements_info`))) as {
      stats_reset: Date | string | null;
    }[];
    statementsReset = infoRows[0]?.stats_reset ? new Date(infoRows[0].stats_reset).toISOString() : null;
  } catch {
    statementsReset = null;
  }
  const statsAgeDays = statementsReset ? (Date.now() - new Date(statementsReset).getTime()) / 86_400_000 : null;

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
    statementsReset,
    statsAgeDays,
    meaningfulAfterDays: 7,
    slowestByMean,
    slowestByTotal,
    unusedIndexes,
    deadliestTables,
  };
}
