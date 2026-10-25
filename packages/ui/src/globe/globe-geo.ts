/**
 * Geometry for the Mapbox globe — pure, so it runs under `bun test` like globe-logic.ts.
 * Mapbox draws its globe with radius 512 · 2^zoom / 2π points; every size below is converted through that, so the
 * satellite globe stands where the drawn one does (02, 13 — ADR-IMPL-055).
 */
import { geoDistance, geoInterpolate, geoOrthographic } from "d3-geo";
import type { Feature, LineString } from "geojson";

import { GLOBE_SPEC, normalizeLambda, routeView } from "./globe-logic";

export type LngLat = [number, number];
export type GeoPoint = { lat: number; lng: number };

const TAU = 2 * Math.PI;
const RAD = Math.PI / 180;

/** Mapbox's globe radius, in points, at a zoom level. */
export const radiusAtZoom = (zoom: number): number => (512 * 2 ** zoom) / TAU;
const zoomForRadius = (radius: number): number => Math.log2((radius * TAU) / 512);

/** The zoom whose globe is the drawn globe at rest: 168 pt (02). */
export const REST_ZOOM = zoomForRadius(GLOBE_SPEC.radius);
/** The opening view's centre: Dubai's longitude, 27°N (02). */
export const OPENING_CENTER: LngLat = [-GLOBE_SPEC.opening[0], -GLOBE_SPEC.opening[1]];
/** Pinch range: the rest size to 3×. A long route may frame below the rest size, to three quarters of it. */
export const ZOOM_RANGE = {
  min: zoomForRadius(GLOBE_SPEC.radius * GLOBE_SPEC.routeZoom.min),
  max: REST_ZOOM + Math.log2(GLOBE_SPEC.zoom.max),
} as const;

/** A pin further than this from the view's centre is hidden: Mapbox's camera sees a little less than a hemisphere. */
export const NEAR_SIDE_DEG = 80;

/**
 * The route as a great circle. Longitudes are unwrapped (they may pass ±180) so the line never jumps across the map
 * where it meets the antimeridian; Mapbox draws unwrapped coordinates continuously.
 */
export function routeLine(from: GeoPoint, to: GeoPoint, steps = 64): Feature<LineString> | null {
  const a: LngLat = [from.lng, from.lat];
  const b: LngLat = [to.lng, to.lat];
  if (geoDistance(a, b) < 1e-6) return null;
  const at = geoInterpolate(a, b);
  const coordinates: LngLat[] = [];
  let previous: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const [lng0, lat] = at(i / steps);
    let lng = lng0;
    if (previous !== null) {
      while (lng - previous > 180) lng -= 360;
      while (previous - lng > 180) lng += 360;
    }
    coordinates.push([lng, lat]);
    previous = lng;
  }
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } };
}

export type GlobeCamera = { center: LngLat; zoom: number };

/**
 * Where the camera holds a chosen route (13): the drawn globe's own framing (`routeView`), in Mapbox's terms — and
 * `lift`, how far below the band's middle the camera's centre must stand for the arc to sit in it.
 */
export function routeCamera(home: GeoPoint | null, dest: GeoPoint): GlobeCamera & { lift: number } {
  const view = routeView(home ? [home.lng, home.lat] : null, [dest.lng, dest.lat]);
  return {
    center: [normalizeLambda(-view.rotation[0]), -view.rotation[1]],
    zoom: REST_ZOOM + Math.log2(view.zoom),
    lift: view.lift,
  };
}

/** The plane's place and heading at the route's middle, in degrees clockwise from north — the map is never rotated. */
export function routeMiddle(from: GeoPoint, to: GeoPoint): { at: LngLat; bearing: number } | null {
  const a: LngLat = [from.lng, from.lat];
  const b: LngLat = [to.lng, to.lat];
  if (geoDistance(a, b) < 1e-6) return null;
  const at = geoInterpolate(a, b);
  const [lng, lat] = at(0.5);
  const [lng2, lat2] = at(0.51);
  const y = Math.sin((lng2 - lng) * RAD) * Math.cos(lat2 * RAD);
  const x =
    Math.cos(lat * RAD) * Math.sin(lat2 * RAD) -
    Math.sin(lat * RAD) * Math.cos(lat2 * RAD) * Math.cos((lng2 - lng) * RAD);
  return { at: [lng, lat], bearing: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 };
}

/**
 * The padding that puts the globe's centre `centreY` points down a map view `viewHeight` points tall: Mapbox centres the
 * camera in what the padding leaves — padding below for a centre in the upper half, above for one in the lower half (a
 * short route lifted under the band's middle).
 */
export function globePadding(centreY: number, viewHeight: number) {
  const below = Math.round(viewHeight - 2 * centreY);
  return {
    paddingTop: Math.max(0, -below),
    paddingLeft: 0,
    paddingRight: 0,
    paddingBottom: Math.max(0, below),
  };
}

/**
 * Where a place stands on the map view, as the drawn globe would put it — the orthographic projection at Mapbox's
 * radius for the camera's zoom. Close enough to decide which labels fit and on which side; Mapbox places the pins
 * themselves. Null beyond NEAR_SIDE_DEG of the centre.
 */
export function mapPoint(
  p: GeoPoint,
  camera: GlobeCamera,
  centre: { x: number; y: number },
): { x: number; y: number } | null {
  if (geoDistance([p.lng, p.lat], camera.center) > NEAR_SIDE_DEG * RAD) return null;
  const xy = geoOrthographic()
    .scale(radiusAtZoom(camera.zoom))
    .translate([centre.x, centre.y])
    .rotate([-camera.center[0], -camera.center[1]])([p.lng, p.lat]);
  return xy ? { x: xy[0], y: xy[1] } : null;
}

/**
 * Whether a point on the map view is on Mapbox's globe (ADR-IMPL-068): within the globe's radius at the camera's zoom
 * of its centre on screen.
 */
export function onGlobeDisc(point: { x: number; y: number }, zoom: number, centre: { x: number; y: number }): boolean {
  return Math.hypot(point.x - centre.x, point.y - centre.y) <= radiusAtZoom(zoom);
}

/**
 * A press on Mapbox's map as a place on the globe (ADR-IMPL-068): where the place Mapbox resolved stands on screen, in
 * the projection `mapPoint` uses — or null, when the press is on the sky. Whose the press is — a pin's first — is
 * `mapboxPress`'s (globe-tap.ts).
 *
 * - A place past the near side (NEAR_SIDE_DEG, where no pin is drawn either) is the sky's. Mapbox answers a press
 *   beside the globe with the nearest place on its horizon, and on Android @rnmapbox/maps 10.3.7 reports as the press's
 *   screen point that place reprojected (`pixelForCoordinate`), on the limb — not the finger. The disc alone would
 *   compare that point with itself; the place decides, whatever the screen point says.
 * - The screen point off the disc (iOS reports the finger itself) is the sky's too.
 */
export function mapTap(
  press: { lng: number; lat: number; screen: { x: number; y: number } },
  camera: GlobeCamera,
  centre: { x: number; y: number },
): { x: number; y: number } | null {
  if (!Number.isFinite(press.lng) || !Number.isFinite(press.lat)) return null;
  const at = mapPoint(press, camera, centre);
  if (!at) return null;
  if (!onGlobeDisc(press.screen, camera.zoom, centre)) return null;
  return at;
}
