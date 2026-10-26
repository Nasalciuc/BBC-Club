/**
 * Where Explore's pieces stand, in points under the status bar (the images are drawn on a 47-pt inset): the sheet's top
 * at its three stops, and the globe's centre at rest and over a chosen route. One source for the sheet, the drawn
 * globe and Mapbox, so the search bar always lands on the globe's foot (02) and a route above the sheet (13).
 */
export const EXPLORE = {
  /** 02: the sheet's top at rest — the search bar 16 pt under it, at 378 on the image. */
  restTop: 315,
  /** 13 and 19: a chosen route's sheet at most this low, at 327.2 on the image; higher on a phone too short for the
   *  first flight to stand whole above the docked pill (`routeContent`). */
  routeTop: 280.2,
  /** Never higher than this: the route's box (globeRoute ± 80) stays above the sheet. */
  routeTopMin: 206,
  /**
   * What a chosen route's sheet must show above the tab bar (13): the grabber, the city, the chips, the fare's summary
   * between its rules and the first flight whole — 381 pt from the sheet's top to the card's foot — then 9.4 to the
   * docked `Request a quote`, its 40.6 and the 13.9 under it.
   */
  routeContent: 444.9,
  /** 16: every offer, the greeting still above it, at 128 on the image. */
  allTop: 81,
  /** 02: the globe's centre at rest, at 266 on the image. */
  globeRest: 219,
  /** 13: a chosen route's middle, at 159.4 on the image — New York at 182, London at 137 (the image: 181.1, 139.6). */
  globeRoute: 112.4,
} as const;

export type SheetStop = 0 | 1 | 2;

/** The sheet's three heights on a container `height` points tall (the screen above the tab bar), lowest first. Never
 *  under 120 pt, and always rising from one stop to the next. */
export function sheetSnaps(height: number, topInset: number): [number, number, number] {
  const at = (top: number) => Math.max(120, height - topInset - top);
  const rest = at(EXPLORE.restTop);
  const route = Math.max(rest + 1, at(routeTop(height, topInset)));
  const all = Math.max(route + 1, at(EXPLORE.allTop));
  return [rest, route, all];
}

/**
 * A chosen route's sheet top, under the status bar: 280.2 where the phone is tall enough for the first flight to stand
 * whole above the docked pill; higher on a shorter one, never above `routeTopMin`.
 */
export function routeTop(height: number, topInset: number): number {
  return Math.min(EXPLORE.routeTop, Math.max(EXPLORE.routeTopMin, height - topInset - EXPLORE.routeContent));
}

/** Where the sheet's top stands on screen at a stop — Mapbox keeps its logo just above it. */
export function sheetTop(stop: number, height: number, topInset: number): number {
  const snaps = sheetSnaps(height, topInset);
  const i = Math.min(2, Math.max(0, Math.round(stop)));
  return height - snaps[i]!;
}

/** The globe's centre on screen: at rest, or over a chosen route. */
export function globeCentreY(route: boolean, topInset: number): number {
  return topInset + (route ? EXPLORE.globeRoute : EXPLORE.globeRest);
}
