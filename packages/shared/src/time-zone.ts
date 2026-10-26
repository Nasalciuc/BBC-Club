/** A zone name: letters first, then letters, digits and `_ - + /` (`Europe/London`, `UTC`, `Etc/GMT+5`). An offset such
 *  as `+05:00` is not a name: some engines take it and Hermes may not, so the app and the server would disagree. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

/** True when `tz` is a time-zone name this runtime's clocks can read. The member's zone feeds `Intl.DateTimeFormat`
 *  (quiet hours, campaign fan-out), which throws a RangeError on a name it does not know — one stored bad zone stopped
 *  every broadcast campaign. Not `Intl.supportedValuesOf`: the same check runs in the app on Hermes, which may not have
 *  it, and it leaves out aliases such as `UTC`. */
export function isIanaZone(tz: string): boolean {
  if (!ZONE_NAME.test(tz)) return false;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}
