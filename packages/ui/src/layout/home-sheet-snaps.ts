/**
 * Where the Explore sheet rests, as fractions of its container (the screen above the tab bar). One source for the
 * sheet and for anything that must stay clear of it — the globe keeps Mapbox's logo and attribution above the sheet.
 */
export const HOME_SHEET_SNAPS = [0.35, 0.6, 1] as const;

/** How many points of the container the sheet covers at a snap index (clamped to the snaps that exist). */
export function homeSheetHeight(index: number, containerHeight: number): number {
  const i = Math.min(Math.max(Math.round(index), 0), HOME_SHEET_SNAPS.length - 1);
  return Math.round(containerHeight * HOME_SHEET_SNAPS[i]!);
}
