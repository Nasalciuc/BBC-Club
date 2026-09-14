export type PushResult =
  | { ok: true; ticketId?: string }
  | {
      ok: false;
      reason: "Unregistered" | "BadDeviceToken" | "RateLimited" | "Transient" | "Fatal";
      retryAfterMs?: number;
    };

/** Implemented by integration/push (APNs, FCM) and by the recording sender in tests. */
export interface PushSender {
  send(input: {
    platform: "ios" | "android";
    token: string;
    title: string;
    body?: string;
    data?: Record<string, string>;
  }): Promise<PushResult>;
}
