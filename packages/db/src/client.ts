import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { relations } from "./relations";

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything that can run queries: the db or a transaction. Repositories accept this, never `Db` alone. */
export type Executor = Db | Tx;

export type DbOptions = {
  /** app: small pool (Bun runs one process; Postgres holds ~100 connections). migrate/seed: 1. */
  max?: number;
  /** Prepared statements are fine on a direct Postgres connection; disable behind pgbouncer (transaction mode). */
  prepare?: boolean;
  logger?: boolean | { logQuery: (q: string, params: unknown[]) => void };
  applicationName?: string;
};

export function createDb(url: string, opts: DbOptions = {}) {
  const client = postgres(url, {
    max: opts.max ?? 10,
    prepare: opts.prepare ?? true,
    idle_timeout: 30,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    connection: { application_name: opts.applicationName ?? "bbc-api", statement_timeout: 15_000 }, // 15 s: nothing in request path may run longer
    transform: { undefined: null }, // undefined → NULL, never "undefined"
    onnotice: () => {}, // quiet NOTICEs from CREATE IF NOT EXISTS etc.
  });
  const db = drizzle({
    client,
    schema,
    relations,
    logger: opts.logger ?? false,
  });
  return Object.assign(db, {
    /** Close the pool (tests, scripts). */
    close: () => client.end({ timeout: 5 }),
    /** Raw client for the few things Drizzle cannot express (advisory locks, LISTEN). Use sparingly, only in infrastructure/. */
    raw: client,
  });
}

/** Run `fn` inside a transaction unless already inside one — lets application code compose use cases. */
export async function withTx<T>(exec: Executor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if ("transaction" in exec && typeof (exec as Db).transaction === "function" && !(exec as any).__isTx) {
    return (exec as Db).transaction(async (tx) => {
      (tx as any).__isTx = true;
      return fn(tx);
    });
  }
  return fn(exec as Tx);
}
