# ADR-IMPL-080 — A process that cannot trust its flags is overloaded, not killed

Status: proposed · Date: 2026-10-28 · Scope: `packages/modules/platform` (`flags`, `generations`, `events/poller.ts`,
the `queue-health` job, `ratelimit`), `packages/shared` (`errors.ts`, `authz/authorize.ts`, `module-contract.ts`),
`apps/api/src/middleware/error-contract.ts` · Amends ADR-IMPL-075 (how the counters are read and waited for, what a
stale kill or pause flag means).

**Context.** ADR-IMPL-075 keeps the flags in one snapshot per process, current through `platform.generations`, and
lets a kill or pause flag fail closed when the counters have not been read for more than `KILL_STALE_MS` (10 s). The
experiments on the 100 000-member volume found three ways that verdict outlives its cause:

- **X4.** The counters' read raced a 500 ms timer. The timer answered the caller; the statement went on, its pooled
  connection held behind the lock it waited on, and one more joined every second. Every caller of that second also
  awaited the read in flight.
- **X5.** While the counters were stale only because Postgres was slow, every gated route answered 503
  `SERVICE_DISABLED` ("temporarily unavailable"): a module that nobody turned off read as switched off.
- **H1.** A stale pause flag parked each delivery it met as `paused`. Nothing put a parked delivery back but an
  operator's `poller.resume`, long after the counters were read again.

**Decision.**

1. **Three answers, not two.** `flags.killedState(module)` and `flags.consumerPauseState(consumer)` answer `"killed"` /
   `"paused"` only when the row says so, `"live"` / `"running"` when it does not, and `"unknown"` when the flag cannot
   be trusted (unread, or the counters older than `KILL_STALE_MS`). `isKilled` stays, failing closed, for callers that
   need a yes or no; `isConsumerPaused` leaves the module contract (no module read it).
2. **`OVERLOADED`.** A gated route whose modules include one `"unknown"` answers 503 `OVERLOADED` with
   `Retry-After: 5` ("The club is busy for a moment. Please try again shortly."); a killed module still answers 503
   `SERVICE_DISABLED`, and killed wins over unknown. A rate limiter that cannot answer (its store unreachable) answers
   the same `OVERLOADED` from the gate's middleware and from the error contract. The app shows the server's message
   (`apps/mobile/src/lib/api.ts`) and treats an unknown code as any other error, so it needs no change.
3. **A delivery is parked only by a flag that says so.** Under `"unknown"` the poller leaves the delivery pending and
   tries it again in 5 s. `queue-health` (every 10 minutes) puts back to pending every paused delivery whose flag no
   longer says paused, and counts them (`resumed`); `queue_paused` is a gauge beside the queue's others, and an alert
   fires after 10 minutes of paused deliveries.
4. **The counters' read.** It runs in a short transaction under `SET LOCAL statement_timeout` (the read's timeout,
   500 ms), so the server stops a read stuck behind a lock and the connection goes back. One read runs at a time, and
   callers answer from what is held while it runs. They wait for it while nothing is held yet, after this process wrote
   a reference table itself (a read that began before the write is let end and followed by another), and while what is
   held is older than 5 s (half of `KILL_STALE_MS`): past that a fail-closed caller would refuse anyway. **No caller
   waits longer than the read's timeout and 100 ms from when the read began**: statement_timeout covers only the
   server's execution, and a read can also wait for a pooled connection, for a connect (`connect_timeout`, 10 s) or on a
   connection that stopped answering. Past that bound the caller answers from what is held — `"unknown"`, and so
   `OVERLOADED`, once it is older than `KILL_STALE_MS` — and the read goes on, still the only one: the pile-up of X4
   does not come back. A read that has not answered in 5 s is given up, so a lost connection does not keep every later
   read from starting; an answer that comes after a newer read's is dropped. A kill or pause check asks the counters
   before it waits for any load of the flags table. The read is asked at most once a second, Postgres answering or not,
   so the first second after Postgres comes back may still answer `OVERLOADED`.
5. **A monotonic clock.** Generations, snapshots, memos and the session cache count on `performance.now()`; a wall clock
   moved back no longer freezes the counters. Home's revalidation keeps the wall clock: every replica must agree on the
   minute a version is read in.
6. **An epoch.** The read also returns `pg_postmaster_start_time()`, as seconds (`extract(epoch …)`: its text follows
   each session's TimeZone, and two pooled connections that differ would move the epoch at every read). A restart, or a counter that went back (a restore,
   a failover), moves an epoch that snapshots and memos compare with their counters, so they load again.
7. **The flags' minute.** The flags snapshot loads again at least once a minute whatever the counters say
   (ADR-IMPL-075, for a write no trigger saw). When only that age has passed — the counters still at what is held — the
   held value is served and the load runs behind the callers; no flag check waits for it. A generation that moved is
   still loaded before it is served: this process must see its own `set()`.

**A new replica.** Before its first read nothing is held, so its first callers wait for that read — 600 ms at most; a
read that fails, or has not answered by then, leaves `"unknown"`, and so `OVERLOADED`, while Caddy can send the request
to another replica. Nothing held, a kill check does not wait for the flags table either: the counters unread say
`"unknown"` first.

**Consequences.** A real kill stays fail-closed and says `SERVICE_DISABLED`. A slow or locked counters table costs one
connection and, after 10 s, `OVERLOADED` with a retry hint instead of a disabled feature; a parked delivery comes back
by itself. A kill or pause check answers within a second whatever Postgres does. Tests:
`packages/shared/src/authz/authorize.test.ts`, `apps/api/test/overloaded.test.ts`,
`packages/modules/platform/tests/flags-bounded.test.ts`, `apps/api/test/rate-limit.test.ts` (the gate's middleware, and a
limiter's error thrown from a route through `error-contract.ts`), `packages/modules/platform/tests/poller-pause.test.ts`,
`packages/modules/platform/tests/generations.test.ts`, `packages/modules/core/identity/tests/session-cache.test.ts`.
