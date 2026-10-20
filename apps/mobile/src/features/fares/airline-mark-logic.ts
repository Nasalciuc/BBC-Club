/**
 * Which airlines the design draws a mark for (04; ADR-IMPL-056) and the size it draws each at — pure, so it is tested
 * without React Native. The crops come from an image 852 px wide drawn at 393 pt: 2.1679 px a point.
 */
export type MarkKey = "BA" | "VS" | "AA";

const PX_PER_PT = 852 / 393;

/** Each mark's crop in pixels (`assets/locked/airlines/`), and so its size in points. */
export const MARK_PIXELS: Record<MarkKey, { width: number; height: number }> = {
  BA: { width: 177 / PX_PER_PT, height: 62 / PX_PER_PT },
  VS: { width: 162 / PX_PER_PT, height: 100 / PX_PER_PT },
  AA: { width: 172 / PX_PER_PT, height: 83 / PX_PER_PT },
};

/** Where 04 centres each mark against the column's middle (54.6, 27.6 from the card's corner), in points. */
export const MARK_NUDGE: Record<MarkKey, { x: number; y: number }> = {
  BA: { x: -1.05, y: -2.2 },
  VS: { x: 1, y: 1.25 },
  AA: { x: 0.1, y: 0.8 },
};

/** The mark for an airline's two-letter code, or null where the design draws none. */
export function airlineMarkKey(code: string | null | undefined): MarkKey | null {
  const c = code?.trim().toUpperCase();
  return c === "BA" || c === "VS" || c === "AA" ? c : null;
}

/**
 * 05: the British Airways speedmarque alone, over the airline's name — the window of its crop that holds only the ribbon
 * (the wordmark under it left out): 37.8 in, 6 down, 39.7 × 10.4 of the crop's 81.65 × 28.6.
 */
export const RIBBON_WINDOW: Partial<Record<MarkKey, { left: number; top: number; width: number; height: number }>> = {
  BA: { left: 82 / PX_PER_PT, top: 13 / PX_PER_PT, width: 86 / PX_PER_PT, height: 22.5 / PX_PER_PT },
};
