// stage 3: APNs HTTP/2 (apns2) and FCM v1 (firebase-admin) adapters implementing this port (see MODULE.md).
export type PushResult =
  | { ok: true; ticketId?: string }
  | { ok: false; reason: "Unregistered" | "BadDeviceToken" | "RateLimited" | "Transient" | "Fatal"; retryAfterMs?: number };

export interface PushSender {
  send(input: { platform: "ios" | "android"; token: string; title: string; body?: string; data?: Record<string, string> }): Promise<PushResult>;
}

/** Used by tests and by stage 0–2, where no real provider credentials exist yet. */
export function recordingSender(): PushSender & { sent: unknown[] } {
  const sent: unknown[] = [];
  return { sent, async send(input) { sent.push(input); return { ok: true, ticketId: `rec_${sent.length}` }; } };
}
