export type PermissionStatus = "granted" | "denied" | "undetermined";

/** Ask once, after a request was received, only if iOS/Android have never asked. */
export function shouldAskForPush(status: PermissionStatus, askedAt: number | null): boolean {
  return status === "undetermined" && askedAt === null;
}
