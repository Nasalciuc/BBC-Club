import { isCalendarDay } from "@bbc/shared/api/v1/fares";

/**
 * Closed-fare facts from a 410 body — only when the server sent `error.context`. The cities, the airline, the cabin
 * and the day (Figma 135:848) come from servers that send them; an older one sends only the route's codes.
 */
export type FareGoneContext = {
  price: number;
  currency: string;
  validUntil: string;
  from: string;
  to: string;
  fromCity: string | null;
  toCity: string | null;
  carrier: string | null;
  cabin: "business" | "first" | null;
  /** The departure's day at the origin, `YYYY-MM-DD` — a day the calendar has (`isCalendarDay`), or null. */
  departDate: string | null;
};

const textOrNull = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function parseFareGoneContext(raw: unknown): FareGoneContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.price !== "number" ||
    typeof o.currency !== "string" ||
    typeof o.validUntil !== "string" ||
    typeof o.from !== "string" ||
    typeof o.to !== "string"
  ) {
    return undefined;
  }
  return {
    price: o.price,
    currency: o.currency,
    validUntil: o.validUntil,
    from: o.from,
    to: o.to,
    fromCity: textOrNull(o.fromCity),
    toCity: textOrNull(o.toCity),
    carrier: textOrNull(o.carrier),
    cabin: o.cabin === "business" || o.cabin === "first" ? o.cabin : null,
    departDate: typeof o.departDate === "string" && isCalendarDay(o.departDate) ? o.departDate : null,
  };
}
