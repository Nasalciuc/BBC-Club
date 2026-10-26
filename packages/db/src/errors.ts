/**
 * An error as a log line may carry it (AGENTS.md rule 6: secrets never in logs). A failed query's message and its own
 * fields hold the SQL parameters — session tokens, emails, phone numbers — so a query error keeps only its name, the
 * Postgres SQLSTATE and the objects it names; the frames of a stack stay, its first lines (the message) do not. Any
 * other error keeps its name and message. Fields an error carries besides those (a row, a request) never reach the log.
 */
export type LoggedError = {
  name: string;
  message: string;
  sqlstate?: string;
  table?: string;
  constraint?: string;
  stack?: string;
  cause?: LoggedError;
};

/** How deep a chain of causes is followed: a query error wrapped by a handler's own error is one level down. */
const MAX_DEPTH = 3;

/** Drizzle's wrapper (`query`, `params`) or postgres-js's own error, which carries the query and its `parameters`. */
function isQueryError(err: object): boolean {
  return (
    (err as { name?: unknown }).name === "DrizzleQueryError" ||
    ("query" in err && ("params" in err || "parameters" in err))
  );
}

function frames(stack: unknown): string | undefined {
  if (typeof stack !== "string") return undefined;
  const lines = stack.split("\n").filter((l) => /^\s+at /.test(l));
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Whether this error or anything in its cause chain is a query error — a wrapper over one is suspect. */
function wrapsQueryError(err: unknown, depth = 0): boolean {
  if (!(err instanceof Error) || depth > MAX_DEPTH) return false;
  if (isQueryError(err)) return true;
  return wrapsQueryError((err as { cause?: unknown }).cause, depth + 1);
}

export function errorForLog(err: unknown, depth = 0): LoggedError {
  if (!(err instanceof Error)) {
    // A thrown string or object: its type only — its text may be anything.
    return { name: err === null ? "null" : typeof err, message: "non-Error thrown" };
  }
  const cause = (err as { cause?: unknown }).cause;
  const next = cause != null && depth < MAX_DEPTH ? errorForLog(cause, depth + 1) : undefined;
  if (isQueryError(err)) {
    // The SQLSTATE and the objects it names: on Drizzle's cause, or on postgres-js's error itself. Its message can quote
    // an input value, so it stays out.
    const pg = (err.name === "DrizzleQueryError" ? (cause ?? {}) : err) as {
      code?: unknown;
      table_name?: unknown;
      constraint_name?: unknown;
    };
    return {
      name: err.name,
      message: "Failed query",
      sqlstate: str(pg.code),
      table: str(pg.table_name),
      constraint: str(pg.constraint_name),
      stack: frames(err.stack),
    };
  }
  // A wrapper that repeats its cause's text (`save failed: ${cause.message}`) repeats the query's parameters too:
  // sanitising the cause below does not clean the copy up here. Its own words are withheld; the cause, sanitised,
  // still says what failed.
  const repeatsCause = cause instanceof Error && cause.message.length > 0 && err.message.includes(cause.message);
  return {
    name: err.name,
    message: repeatsCause && wrapsQueryError(err) ? "message withheld: it repeats a failed query" : err.message,
    stack: frames(err.stack),
    ...(next ? { cause: next } : {}),
  };
}

/** The same, as one line — for a column or a message that holds text (a request's last send error). */
export function errorLine(err: unknown): string {
  const e = errorForLog(err);
  const where = [e.sqlstate, e.table, e.constraint].filter(Boolean).join(" ");
  return `${e.name}: ${e.message}${where ? ` (${where})` : ""}`;
}
