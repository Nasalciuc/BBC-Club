/**
 * Geometry for the Mapbox globe — pure, so it runs under `bun test` like globe-logic.ts.
 * `radiusAtZoom`, 512 · 2^zoom / 2π points, is the orthographic model the drawn globe shares: the zooms below (the rest
 * size, the pinch to 3×, a route's framing) are converted through it (02, 13 — ADR-IMPL-055), and `mapPoint` lays out
 * the pins' labels in it. Mapbox's own camera is a perspective one and draws its globe 1 / cos 45° larger at the
 * view's centre (`limbRadius`, `cameraPoint`: its limb about 203 pt out at rest on an 852-pt view, not 168); a press is
 * measured there (`mapTap`, globe-tap.ts `mapboxPress`). That camera is read from mapbox-gl-js and wants a phone to
 * confirm (ADR-IMPL-068).
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

/** The zoom whose `radiusAtZoom` is the drawn globe's radius at rest, 168 pt (02); Mapbox's camera draws it larger. */
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
 * Mapbox's camera (ADR-IMPL-068). Its field of view is 0.6435 rad (36.87°; the tangent of its half is 1/3), so the
 * camera stands half a view height over tan(fov/2) — 1.5 view heights — above the globe at the view's centre. Below
 * the globe's change to Mercator Mapbox draws the globe at Mercator's scale at 45°, and the camera stands cos 45° of
 * that, in the globe's points: 1.06 view heights. The change starts at zoom 3 on a 1,024-pt view, a little earlier on a
 * smaller one (2.4 on a 667-pt view, where at 3× — 2.63 — it has barely begun: the margin below covers it up to about
 * 80°N; nearer the pole — the horizon 4.2° nearer at 85°N, about as far as the centre goes — the disc below stops the
 * sky; on a 640-pt view centred at 80°N it brings the horizon 2.8° nearer, and the disc stops the sky there too —
 * `mapTap`).
 * Read from mapbox-gl-js 2.15 (`Transform._calcMatrices`, `Globe.pixelSpaceConversion`, `GLOBE_SCALE_MATCH_LATITUDE`):
 * the native SDK (11.23.1) is downloaded at build time, not in the repository, and is assumed to draw its globe as
 * gl-js does. Without the 45° factor the camera would stand farther and see more (83° at rest, not 81°) of a globe
 * drawn smaller (its limb 149 pt out at rest, not 203): the nearer camera sees less, so the horizon below holds either
 * way, and the farther one's limb stands inside the disc below.
 */
const MAPBOX_FOV = 0.6435011087932844;
const GLOBE_SCALE_MATCH = Math.cos(45 * RAD);

/** Mapbox's focal length: half the view's height over tan(fov/2) — 1.5 view heights, in screen points. */
const focalLength = (viewHeight: number): number => (0.5 * viewHeight) / Math.tan(MAPBOX_FOV / 2);

/** How far Mapbox's camera stands above the globe's surface at the view's centre, in the globe's points. */
export function cameraDistance(viewHeight: number): number {
  return focalLength(viewHeight) * GLOBE_SCALE_MATCH;
}

/**
 * Where that camera draws the globe's limb at a zoom: its distance on screen from the globe's centre, R·f / √(d² + 2dR)
 * — R the globe's radius, f the focal length, d the camera's distance. Seen from cos 45° of the focal length, the globe
 * is drawn 1 / cos 45° larger at the view's centre than `radiusAtZoom`: on an 852-pt view the limb stands about 203 pt
 * out at rest (radiusAtZoom: 168), 360 at 2× (336) and 490 at 3× (504).
 */
export function limbRadius(zoom: number, viewHeight: number): number {
  const r = radiusAtZoom(zoom);
  const d = cameraDistance(viewHeight);
  return (r * focalLength(viewHeight)) / Math.sqrt(d * d + 2 * d * r);
}

/**
 * Where that camera draws the place `mapPoint` puts at `at` (ADR-IMPL-068): on the same bearing from the globe's centre
 * on screen, f·R·sin α / (d + R − R·cos α) out instead of `mapPoint`'s R·sin α — α the place's angle from the view's
 * centre. The perspective draws a place farther out: 1 / cos 45° near the view's centre, and on an 852-pt view at rest
 * 188 pt instead of 146 at 60° from it. Mapbox shows its pins (MarkerView) there, so `mapboxPress` measures a press
 * against them, and the city against the finger, there.
 */
export function cameraPoint(
  at: { x: number; y: number },
  zoom: number,
  centre: { x: number; y: number },
  viewHeight: number,
): { x: number; y: number } {
  const r = radiusAtZoom(zoom);
  const dx = at.x - centre.x;
  const dy = at.y - centre.y;
  const sin = Math.min(1, Math.hypot(dx, dy) / r);
  const k = focalLength(viewHeight) / (cameraDistance(viewHeight) + r - r * Math.sqrt(1 - sin * sin));
  return { x: centre.x + dx * k, y: centre.y + dy * k };
}

/**
 * Mapbox's horizon at a zoom: how far from the view's centre, in degrees, its camera sees the globe — acos(R / (R + d)),
 * R the globe's radius, d the camera's distance. On an 852-pt view about 81° at rest, 74° at 2×, 69° at 3×: zooming in
 * brings it nearer, under the fixed NEAR_SIDE_DEG from about 1.1×.
 */
export function horizonDeg(zoom: number, viewHeight: number): number {
  const r = radiusAtZoom(zoom);
  return Math.acos(r / (r + cameraDistance(viewHeight))) / RAD;
}

/**
 * Whether a place stands past Mapbox's horizon for a camera: hidden behind the globe, so no pin there is a target
 * (ADR-IMPL-068). `mapPoint` keeps places to NEAR_SIDE_DEG, which is past the horizon zoomed in (74° at 2× on an 852-pt
 * view) and on a short view at rest (79° on 667 pt); their 44-pt targets would reach out over the sky. Read from the
 * place itself, not from where the labels' layout put it: that layout follows the camera a step behind (up to 0.03 zoom,
 * 0.5°), and near the horizon a point read back at the wrong zoom is off by degrees.
 */
export function pastHorizon(place: GeoPoint, camera: GlobeCamera, viewHeight: number): boolean {
  return geoDistance([place.lng, place.lat], camera.center) / RAD > horizonDeg(camera.zoom, viewHeight);
}

/**
 * How far inside the horizon a pressed place must stand to be the globe's (ADR-IMPL-068): Mapbox answers a press on the
 * sky with a place on its horizon. The 2° cover the camera Explore holds being a frame behind Mapbox's (the slow turn,
 * a fling); at the limb they are under half a point on screen.
 */
export const HORIZON_MARGIN_DEG = 2;

/** The near side a press may land on at a zoom: HORIZON_MARGIN_DEG inside the horizon, and never past NEAR_SIDE_DEG. */
export function tapNearSideDeg(zoom: number, viewHeight: number): number {
  return Math.min(NEAR_SIDE_DEG, horizonDeg(zoom, viewHeight) - HORIZON_MARGIN_DEG);
}

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
 * Whether a point on the map view is on Mapbox's globe (ADR-IMPL-068): within the limb its camera draws at the zoom
 * (`limbRadius`, on a map view `viewHeight` points tall) of the globe's centre on screen.
 */
export function onGlobeDisc(
  point: { x: number; y: number },
  zoom: number,
  centre: { x: number; y: number },
  viewHeight: number,
): boolean {
  return Math.hypot(point.x - centre.x, point.y - centre.y) <= limbRadius(zoom, viewHeight);
}

/**
 * A press on Mapbox's map as a place on the globe (ADR-IMPL-068): where the place Mapbox resolved stands on screen, in
 * the projection `mapPoint` uses — or null, when the press is on the sky. Whose the press is — a pin's first — is
 * `mapboxPress`'s (globe-tap.ts).
 *
 * - A place past the near side at the camera's zoom is the sky's (`tapNearSideDeg`: the horizon less 2° — the horizon
 *   81° from the view's centre at rest, 69° at 3×, on a map view `viewHeight` = 852 pt tall). Mapbox answers a press
 *   beside the globe with the nearest place on its horizon, and on Android @rnmapbox/maps 10.3.7 reports as the press's
 *   screen point that place reprojected (`pixelForCoordinate`), on the limb — not the finger. The disc alone would
 *   compare that point with itself, and a fixed limit (80°) let the horizon's place through once zooming in brought the
 *   horizon nearer than it; the place decides, at the zoom the press was made at, whatever the screen point says.
 * - The screen point off the disc (iOS reports the finger itself) is the sky's too. The disc is the limb the same camera
 *   draws (`onGlobeDisc`), so the two tests cover each other: a camera at least as far as this one puts the sky's place
 *   past the near side (its horizon is farther), and a nearer one draws a larger limb, its sky — the finger, or the
 *   place reprojected — off this disc. Measured against `radiusAtZoom`, the disc took the globe's outer ring for the
 *   sky (168 to 203 pt out at rest, 336 to 360 at 2×); the 2° margin costs the rim under half a point.
 */
export function mapTap(
  press: { lng: number; lat: number; screen: { x: number; y: number } },
  camera: GlobeCamera,
  centre: { x: number; y: number },
  viewHeight: number,
): { x: number; y: number } | null {
  if (!Number.isFinite(press.lng) || !Number.isFinite(press.lat)) return null;
  // Written so that a limit that is no number (no view height) leaves the press to the sky.
  const nearSide = tapNearSideDeg(camera.zoom, viewHeight) * RAD;
  if (!(geoDistance([press.lng, press.lat], camera.center) <= nearSide)) return null;
  const at = mapPoint(press, camera, centre);
  if (!at) return null;
  if (!onGlobeDisc(press.screen, camera.zoom, centre, viewHeight)) return null;
  return at;
}
