import pino from "pino";

/** Keys that must never reach a log line or an error report. Redaction is at the logger, not at call sites,
 *  because call sites forget. Add to this list before adding a field to any payload. */
const REDACT = [
  "password",
  "newPassword",
  "currentPassword",
  "otp",
  "code",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "sessionToken",
  "cookie",
  "authorization",
  "nativeToken",
  "expoToken",
  "secret",
  "x-internal-secret",
  "email",
  "phone",
  "note",
  "*.password",
  "*.otp",
  "*.token",
  "*.email",
  "*.phone",
  "*.*.email",
  "*.*.phone",
  "*.note",
  "*.*.note",
  "*.body",
  "*.request",
  "*.client",
];

/** `destination` is for tests that read what a line would carry; the process writes to stdout. */
export function createLogger(opts: { level?: string; pretty?: boolean } = {}, destination?: pino.DestinationStream) {
  return pino(
    {
      level: opts.level ?? "info",
      redact: { paths: REDACT, censor: "[redacted]" },
      base: undefined, // no pid/hostname noise; the container already labels lines
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: opts.pretty && !destination ? { target: "pino-pretty", options: { colorize: true } } : undefined,
    },
    destination,
  );
}
export type Logger = ReturnType<typeof createLogger>;

/** Emails appear in support conversations; when one must be logged, log it masked. */
export const maskEmail = (e: string) => {
  const [u, d] = e.split("@");
  return `${u?.slice(0, 1)}***@${d ?? ""}`;
};
