import { nextFlushDelay, type QueuedRequest } from "./queue-logic";

export type FlushTimerDeps = {
  /** The queue as it is now. Reading it may tidy it, and the tidy may call `schedule` again: that is safe. */
  pending: () => readonly QueuedRequest[];
  /** Whether the phone is online right now. */
  online: () => Promise<boolean>;
  /** One flush of the whole queue (lib/queue.ts: one at a time). */
  flush: () => Promise<{ sent: number }>;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * While the app simply stays open, a request waiting on the phone is tried again when it is due (`nextFlushDelay`):
 * one saved after a timeout, one waiting after a server failure — not left until the next return to the foreground.
 * Online only. A try that sent nothing makes the next one wait longer, so a server that does not answer is not asked
 * every 30 seconds; `reset` starts the waits over (signed in, back in the foreground, back online). After `stop` (a
 * sign-out), nothing it started flushes. Kept out of the root layout so it is tested (flush-timer.test.ts).
 */
export function createFlushTimer(deps: FlushTimerDeps): { schedule: () => void; reset: () => void; stop: () => void } {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let stopped = false;
  let timer: unknown = null;
  /** Tries in a row by this timer that sent nothing. */
  let quietTries = 0;

  async function fire(): Promise<void> {
    timer = null;
    let sent = 0;
    try {
      if (await deps.online()) {
        if (stopped) return;
        sent = (await deps.flush()).sent;
      }
    } catch {
      // As a try that sent nothing: the timer stays alive.
    }
    if (stopped) return;
    quietTries = sent > 0 ? 0 : quietTries + 1;
    schedule();
  }

  function schedule(): void {
    if (stopped) return;
    // Read before touching the timer: the read may tidy the queue, which calls this again.
    const delay = nextFlushDelay(deps.pending(), now(), quietTries);
    if (timer !== null) clearTimer(timer);
    timer =
      delay === null
        ? null
        : setTimer(() => {
            void fire().catch(() => undefined);
          }, delay);
  }

  return {
    schedule,
    reset() {
      quietTries = 0;
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
