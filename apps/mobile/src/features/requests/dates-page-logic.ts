/**
 * The line over the dates page's title (07: `NEW YORK TO LONDON`): the trip by its cities, or the destination alone
 * when the origin is not known; nothing when neither is. Pure, so it is tested without React Native.
 */
export function datesEyebrow(fromCity: string | null | undefined, toCity: string | null | undefined): string {
  const from = fromCity?.trim();
  const to = toCity?.trim();
  if (from && to) return `${from} to ${to}`.toUpperCase();
  if (to) return `To ${to}`.toUpperCase();
  return "";
}
