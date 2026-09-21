export type PushResult =
  | { ok: true; ticketId?: string }
  | {
      ok: false;
      reason: "Unregistered" | "BadDeviceToken" | "RateLimited" | "Transient" | "Fatal";
      retryAfterMs?: number;
    };

/** The only import surface of @bbc/push. module.ts implements it; consumers import it. */
export type PushFacade = {
  send(input: {
    platform: "ios" | "android";
    token: string;
    title: string;
    body?: string;
    data?: Record<string, string>;
  }): Promise<PushResult>;
};
