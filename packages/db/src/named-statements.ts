import type postgres from "postgres";

type Client = postgres.Sql;

/** Every statement Drizzle sends becomes a named prepared statement: parsed and planned once per server connection,
 *  then bound and executed in one round trip. Drizzle asks postgres.js for an unnamed statement unless a query was
 *  built with `.prepare()`; this wrapper turns that request into a named one, inside transactions and savepoints too.
 *  A statement without parameters keeps postgres.js's simple protocol, so a migration file still runs as one batch.
 *  PgBouncer 1.21+ carries named statements across transaction pooling (`max_prepared_statements`, ADR-IMPL-074). */
export function namedStatements(client: Client): Client {
  return new Proxy(client, {
    get(target, key) {
      if (key === "unsafe")
        return (query: string, params?: unknown[], options?: Record<string, unknown>) =>
          target.unsafe(query, params as never[], { ...options, prepare: true });
      if (key === "begin" || key === "savepoint")
        return (...args: unknown[]) => {
          const fn = args[args.length - 1] as (inner: Client) => unknown;
          args[args.length - 1] = (inner: Client) => fn(namedStatements(inner));
          return (Reflect.get(target, key) as (...a: unknown[]) => unknown).apply(target, args);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
