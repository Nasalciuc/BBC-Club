/** Offline only when the platform says so; `null` (not yet known) is not offline — a blip must not empty the sheet. */
export function isOffline(s: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  return s.isConnected === false || s.isInternetReachable === false;
}
