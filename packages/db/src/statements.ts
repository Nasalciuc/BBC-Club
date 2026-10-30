import type { Executor } from "./client";

/** What `.prepare(name)` on a Drizzle query returns: placeholders are filled at each execution. */
type Prepared<P, R> = { execute(placeholders?: P): Promise<R> };
type Preparable<P, R> = { prepare(name: string): Prepared<P, R> };

/** A hot statement whose SQL and result mapper are built once per executor instead of at every call. On the process's
 *  `db` that is once per process; on a transaction it is once per transaction, as building it in place would be.
 *  Values go through `sql.placeholder(...)` in `build`, never into the SQL text, so the text — and the database's plan
 *  for it — stays one. A value an index predicate names (`status = 'active'`) is written in the SQL as a literal: a
 *  parameter there would hide it from the generic plan (ADR-IMPL-074). */
export function statement<P extends Record<string, unknown>, R>(
  name: string,
  build: (exec: Executor) => Preparable<P, R>,
): (exec: Executor, placeholders: P) => Promise<R> {
  const built = new WeakMap<object, Prepared<P, R>>();
  return (exec, placeholders) => {
    let prepared = built.get(exec);
    if (!prepared) {
      prepared = build(exec).prepare(name);
      built.set(exec, prepared);
    }
    return prepared.execute(placeholders);
  };
}
