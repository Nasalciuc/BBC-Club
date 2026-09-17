import type { z } from "zod";
import type { FareVM } from "@bbc/shared/api/v1/fares";

type Fare = z.infer<typeof FareVM>;

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

const dur = (m: number | null) => (m == null ? null : `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, "0")}`);

/** Pure facts line — unit-tested with and without departAt. */
export function fareFacts(fare: Pick<Fare, "departAt" | "arriveAt" | "durationMinutes" | "nonstop">): string {
  const timed = fare.departAt != null && fare.arriveAt != null;
  if (timed) {
    const d = dur(fare.durationMinutes);
    return `${hhmm(fare.departAt!)} — ${hhmm(fare.arriveAt!)}${d ? ` · ${d}` : ""}`;
  }
  const d = dur(fare.durationMinutes);
  return `${fare.nonstop ? "NONSTOP" : "1 STOP"}${d ? ` · ${d}` : ""}`;
}
