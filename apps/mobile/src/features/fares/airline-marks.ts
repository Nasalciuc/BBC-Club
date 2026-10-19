import aa from "@/assets/images/club/airlines/aa.webp";
import ba from "@/assets/images/club/airlines/ba.webp";
import vs from "@/assets/images/club/airlines/vs.webp";
import type { AirlineMark } from "@bbc/ui";

import { airlineMarkKey, MARK_NUDGE, MARK_PIXELS, type MarkKey } from "./airline-mark-logic";

const SOURCES: Record<MarkKey, number> = { BA: ba, VS: vs, AA: aa };

/**
 * The airline's mark as the design draws it (04; ADR-IMPL-056): the package's own crops, white-backed, set at the size
 * the image draws them — never recoloured or redrawn. An airline the design does not draw has none here: its card
 * shows the fare's logo, else the airline's name.
 */
export function airlineMark(code: string | null | undefined): AirlineMark | null {
  const key = airlineMarkKey(code);
  if (!key) return null;
  const { width, height } = MARK_PIXELS[key];
  return { source: SOURCES[key], width, height, nudge: MARK_NUDGE[key] };
}
