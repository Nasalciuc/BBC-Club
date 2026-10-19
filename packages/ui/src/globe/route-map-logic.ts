/**
 * The route card's map (05; sheet 40 · 08) — pure, so it runs under `bun test`. The flight's great circle seen from a
 * little nearer the equator, so it arcs as on the globe, fitted into the card with room for the airports' names.
 */
import { geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";

import type { LonLat, Point } from "./globe-logic";

/** How far toward the equator the map looks from the route's middle: the arc bows up (13, 05). */
export const MAP_TILT_DEG = 20;

export type RouteMap = {
  /** The land, as an SVG path in the card's points. */
  land: string;
  /** The route, as an SVG path. */
  route: string;
  from: Point;
  to: Point;
  /** The plane at the route's middle, its heading in degrees clockwise from east. */
  plane: { at: Point; angle: number } | null;
};

export function routeMap(
  from: LonLat,
  to: LonLat,
  land: GeoPermissibleObjects,
  size: { width: number; height: number },
  pad: { x: number; top: number; bottom: number } = { x: 72, top: 22, bottom: 26 },
): RouteMap {
  const at = geoInterpolate([from[0], from[1]], [to[0], to[1]]);
  const [lng, lat] = at(0.5);
  const centreLat = lat >= 0 ? lat - MAP_TILT_DEG : lat + MAP_TILT_DEG;
  const line: GeoPermissibleObjects = {
    type: "LineString",
    coordinates: Array.from({ length: 49 }, (_, i) => at(i / 48)),
  };
  const projection = geoOrthographic()
    .rotate([-lng, -centreLat])
    .clipAngle(90)
    .precision(0.5)
    .fitExtent(
      [
        [pad.x, pad.top],
        [Math.max(pad.x + 1, size.width - pad.x), Math.max(pad.top + 1, size.height - pad.bottom)],
      ],
      line,
    );
  const path = geoPath(projection);
  const point = (p: readonly [number, number]): Point => {
    const xy = projection([p[0], p[1]]);
    return xy ? [xy[0], xy[1]] : [size.width / 2, size.height / 2];
  };
  const mid = point(at(0.5));
  const before = point(at(0.47));
  const after = point(at(0.53));
  return {
    land: path(land) ?? "",
    route: path(line) ?? "",
    from: point(from),
    to: point(to),
    plane: { at: mid, angle: (Math.atan2(after[1] - before[1], after[0] - before[0]) * 180) / Math.PI },
  };
}
