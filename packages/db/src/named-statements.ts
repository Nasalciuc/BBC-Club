import type postgres from "postgres";

type Client = postgres.Sql;

/** Past this many parameters a statement is sent unnamed: its text usually varies with the size of its input (a
 *  multi-row insert, a list not yet bound as one array), and each variant would stay prepared on its server connection
 *  until the connection closes. 128: the airports' typeahead, whose text is fixed, takes 86 to 96 and stays named; a
 *  notifications page of eight columns is named up to 16 rows. */
export const MAX_NAMED_PARAMS = 128;

/** Every statement Drizzle sends with up to MAX_NAMED_PARAMS parameters becomes a named prepared statement: parsed
 *  and planned once per server connection, then bound and executed in one round trip. Drizzle asks postgres.js for an
 *  unnamed statement unless a query was built with `.prepare()`; this wrapper turns that request into a named one,
 *  inside transactions and savepoints too. A statement without parameters keeps postgres.js's simple protocol, so a
 *  migration file still runs as one batch; one with more parameters than MAX_NAMED_PARAMS stays unnamed.
 *  PgBouncer 1.21+ carries named statements across transaction pooling (`max_prepared_statements`, ADR-IMPL-074). */
export function namedStatements(client: Client): Client {
  return new Proxy(client, {
    get(target, key) {
      if (key === "unsafe")
        return (query: string, params?: unknown[], options?: Record<string, unknown>) =>
          target.unsafe(query, params as never[], {
            ...options,
            prepare: (params?.length ?? 0) <= MAX_NAMED_PARAMS,
          });
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
