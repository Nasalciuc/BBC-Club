import type { z } from "zod";
import type { FareVM } from "@bbc/shared/api/v1/fares";

type Fare = z.infer<typeof FareVM>;

const dur = (m: number | null) => (m == null ? null : `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, "0")}`);

/** Pure facts line — unit-tested with and without departLocal. Airport clocks only. */
export function fareFacts(
  fare: Pick<Fare, "departLocal" | "arriveLocal" | "arriveDayOffset" | "durationMinutes" | "nonstop">,
): string {
  if (fare.departLocal && fare.arriveLocal) {
    const plus = fare.arriveDayOffset > 0 ? ` +${fare.arriveDayOffset}` : "";
    const d = dur(fare.durationMinutes);
    return `${fare.departLocal} — ${fare.arriveLocal}${plus}${d ? ` · ${d}` : ""}`;
  }
  const d = dur(fare.durationMinutes);
  return `${fare.nonstop ? "NONSTOP" : "1 STOP"}${d ? ` · ${d}` : ""}`;
}
