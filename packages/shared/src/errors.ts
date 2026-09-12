import { z } from "zod";

/** One error shape for every API response. The app maps `code` to a RequestState; `message` is already
 *  in the club's voice; `details` is only ever field-level validation information. */
export const ERROR_CODES = ["VALIDATION", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "GONE", "RATE_LIMITED", "SERVICE_DISABLED", "INTERNAL"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ApiError = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
  CONFLICT: 409, GONE: 410, RATE_LIMITED: 429, SERVICE_DISABLED: 503, INTERNAL: 500,
};

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION: "Please check the highlighted fields.",
  UNAUTHORIZED: "Please sign in.",
  FORBIDDEN: "Not allowed.",
  NOT_FOUND: "Not found.",
  CONFLICT: "That doesn't match what we already have.",
  GONE: "This proposal has closed. Julia can find you the next one.",
  RATE_LIMITED: "Let's slow down for a moment. Please try again shortly.",
  SERVICE_DISABLED: "This part of the club is briefly unavailable.",
  INTERNAL: "Something didn't go as planned. Please try again.",
};

export function apiError(code: ErrorCode, opts: { message?: string; requestId?: string; details?: { path: string; message: string }[]; retryAfterSeconds?: number } = {}): ApiError {
  return { error: { code, message: opts.message ?? DEFAULT_MESSAGES[code], requestId: opts.requestId, details: opts.details, retryAfterSeconds: opts.retryAfterSeconds } };
}

/** Thrown inside modules; the host's error middleware turns it into the shape above with the right status. */
export class DomainError extends Error {
  constructor(public code: ErrorCode, message?: string, public details?: { path: string; message: string }[]) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "DomainError";
  }
}
