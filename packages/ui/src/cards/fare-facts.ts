import type { z } from "zod";
import type { FareVM } from "@bbc/shared/api/v1/fares";

type Fare = z.infer<typeof FareVM>;

const dur = (m: number | null) => (m == null ? null : `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, "0")}`);

/**
 * The fare row's facts as Figma 89:387 draws them: the stops and the time in the air, `NONSTOP · 7H 05`. The clocks
 * (18:55 — 07:00 +1) belong to the fare's page, where both airports have room; the row never shows them.
 */
export function fareFacts(fare: Pick<Fare, "durationMinutes" | "nonstop">): string {
  const d = dur(fare.durationMinutes);
  // The catalog knows nonstop or not, never how many stops: a connecting fare says so without counting them.
  return `${fare.nonstop ? "NONSTOP" : "CONNECTING"}${d ? ` · ${d}` : ""}`;
}
