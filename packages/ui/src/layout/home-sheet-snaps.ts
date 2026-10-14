/** Figma's frames are 852 pt tall with an 84-pt tab bar: the sheet's container is 768 pt. */
const FIGMA_CONTAINER = 768;

/**
 * Where the Explore sheet rests, as fractions of its container (the screen above the tab bar). One source for the
 * sheet and for anything that must stay clear of it — the globe keeps Mapbox's logo and attribution above the sheet.
 *
 * Figma 04 · Screens, measured on the 393×852 frames: Rest (89:386) is a 300 pt sheet, a chosen destination (89:387,
 * 536:10635) a 544 pt sheet, Typing and Expanded (89:388, 89:389) a 656 pt sheet that leaves the 48 pt header and its
 * Cancel / Done visible above it. Exact fractions, so a 393 × 852 phone lands on Figma's points. Never 100%: the header
 * stays reachable.
 */
export const HOME_SHEET_SNAPS = [300 / FIGMA_CONTAINER, 544 / FIGMA_CONTAINER, 656 / FIGMA_CONTAINER] as const;

/** How many points of the container the sheet covers at a snap index (clamped to the snaps that exist). */
export function homeSheetHeight(index: number, containerHeight: number): number {
  const i = Math.min(Math.max(Math.round(index), 0), HOME_SHEET_SNAPS.length - 1);
  return Math.round(containerHeight * HOME_SHEET_SNAPS[i]!);
}
