export type PushFacade = import("./types").PushFacade;
export type PushResult = import("./types").PushResult;
import type { PushFacade as PushFacadeImpl } from "./types";

/** Used by tests and by stage 0–2, where no real provider credentials exist yet. */
export function recordingSender(): PushFacadeImpl & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    async send(input) {
      sent.push(input);
      return { ok: true, ticketId: `rec_${sent.length}` };
    },
  };
}
