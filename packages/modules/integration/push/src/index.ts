// stage 3: APNs HTTP/2 (apns2) and FCM v1 (firebase-admin) adapters implementing this port (see MODULE.md).
// The port is declared by the consumer (core/notifications); this adapter only implements it.
import type { PushSender, PushResult } from "@bbc/notifications/ports/push";
export type { PushSender, PushResult };

/** Used by tests and by stage 0–2, where no real provider credentials exist yet. */
export function recordingSender(): PushSender & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    async send(input) {
      sent.push(input);
      return { ok: true, ticketId: `rec_${sent.length}` };
    },
  };
}
