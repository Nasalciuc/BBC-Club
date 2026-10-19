/**
 * The drawn globe's pure logic — no React Native imports, so all of it runs under `bun test`.
 * 3.0 (ADR-IMPL-055): the Earth by day on the pale sky, measured on the owner's images — 02 (Explore at rest: a globe of
 * radius 168 pt centred on Dubai, London to Tokyo in view) and 13 (a chosen route framed across the top of the screen).
 */
import { geoDistance, geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";

export type LonLat = readonly [number, number];
export type Rotation = readonly [number, number]; // d3 rotate([λ, φ]); the view's centre is (-λ, -φ)
export type Point = readonly [number, number];

export const GLOBE_SPEC = {
  frame: 760, //                      the drawn globe's square frame: room for a route framed at up to 3× (13)
  radius: 168, //                     02: the globe at rest, 336 pt across
  opening: [-55, -27] as Rotation, // 02: centred near Dubai (55°E 27°N) — London, Paris, Dubai and Tokyo in view
  periodMs: 120_000, //               one turn in 120 s while nothing is chosen (1.0, kept)
  routeStroke: 2, //                  13: the route, a white line
  plane: 18, //                       13: the plane at the route's middle
  pin: { width: 18, height: 25, hit: 44 }, // 02: the navy drop pin, its tip on the place; 44-pt targets (DESIGN.md)
  idleResumeMs: 4_000, //             the turn resumes 4 s after the last touch
  returnTauMs: 180, //                ease toward a view, ~95 % in 540 ms
  zoom: { min: 1, max: 3, detailAbove: 1.5 }, // a pinch: the rest size to 3×
  routeZoom: { min: 0.75, max: 3 }, //  a route may frame below the rest size when it is long (New York to Singapore)
  tilt: { min: -80, max: 80 }, //     keeps the poles from flipping while dragging
} as const;

/**
 * Where a chosen route must fit, in points from the frame's centre (13): wide enough for the labels at either end,
 * low enough to stay clear of the sheet.
 */
export const ROUTE_BOX = { halfWidth: 105, halfHeight: 80 } as const;

export const radiusFor = (size: number, zoom = 1): number => (size * GLOBE_SPEC.radius * zoom) / GLOBE_SPEC.frame;

export function normalizeLambda(l: number): number {
  const r = ((((l + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

/** λ after `elapsedMs` of rotation. The centre meridian moves west, as the Earth turns; the loop closes exactly. */
export function rotationAt(elapsedMs: number, startLambda: number = GLOBE_SPEC.opening[0]): number {
  const turns = (((elapsedMs % GLOBE_SPEC.periodMs) + GLOBE_SPEC.periodMs) % GLOBE_SPEC.periodMs) / GLOBE_SPEC.periodMs;
  return normalizeLambda(startLambda + 360 * turns);
}

export type GlobeInputs = {
  reducedMotion: boolean;
  appActive: boolean;
  interacting: boolean;
  selected: string | null;
  msSinceInteraction: number | null; // null: no interaction yet
  /** The view is where the selection wants it: the route framed. */
  atTarget: boolean;
};
export type GlobeMode = "still" | "rotating" | "paused" | "framing";

/** Priority, top first: background → finger → reduced motion → selection → idle wait → rotation. */
export function globeMode(i: GlobeInputs): GlobeMode {
  if (!i.appActive) return "paused";
  if (i.interacting) return "paused";
  if (i.reducedMotion) return "still"; // the engine jumps to a chosen route instead of flying there
  if (i.selected !== null) return i.atTarget ? "still" : "framing"; // 13: the route held still once framed
  if (i.msSinceInteraction !== null && i.msSinceInteraction < GLOBE_SPEC.idleResumeMs) return "paused";
  return "rotating";
}

/** One step toward `to`, frame-rate independent; λ takes the short way round. */
export function approach(
  from: { rotation: Rotation; zoom: number },
  to: { rotation: Rotation; zoom: number },
  dtMs: number,
) {
  const k = 1 - Math.exp(-dtMs / GLOBE_SPEC.returnTauMs);
  const dl = normalizeLambda(to.rotation[0] - from.rotation[0]);
  const next = {
    rotation: [
      normalizeLambda(from.rotation[0] + dl * k),
      from.rotation[1] + (to.rotation[1] - from.rotation[1]) * k,
    ] as Rotation,
    zoom: from.zoom + (to.zoom - from.zoom) * k,
  };
  const done = atView(next, to);
  return done ? { rotation: to.rotation, zoom: to.zoom, done: true } : { ...next, done: false };
}

export function isOnNearSide(p: LonLat, rotation: Rotation): boolean {
  return geoDistance([p[0], p[1]], [-rotation[0], -rotation[1]]) < Math.PI / 2 - 1e-6;
}

export function projector(size: number, rotation: Rotation, zoom = 1) {
  const projection = geoOrthographic()
    .scale(radiusFor(size, zoom))
    .translate([size / 2, size / 2])
    .rotate([rotation[0], rotation[1]])
    .clipAngle(90)
    .precision(0.7);
  const path = geoPath(projection);
  return {
    /** Screen point, or null on the far hemisphere: a pin there is not drawn. */
    point(p: LonLat): Point | null {
      if (!isOnNearSide(p, rotation)) return null;
      const xy = projection([p[0], p[1]]);
      return xy ? [xy[0], xy[1]] : null;
    },
    path: (geo: GeoPermissibleObjects): string => path(geo) ?? "",
    sphere: (): string => path({ type: "Sphere" }) ?? "",
  };
}

/** The great circle between two places, as a line d3 clips at the horizon. */
export function greatCircle(from: LonLat, to: LonLat, steps = 48): GeoPermissibleObjects {
  const at = geoInterpolate([from[0], from[1]], [to[0], to[1]]);
  return { type: "LineString", coordinates: Array.from({ length: steps + 1 }, (_, i) => at(i / steps)) };
}

/** The plane at the route's middle (13): where it sits on screen and the way it points, in degrees clockwise from east. */
export function planeOnRoute(
  proj: ReturnType<typeof projector>,
  from: LonLat,
  to: LonLat,
): { at: Point; angle: number } | null {
  const at = geoInterpolate([from[0], from[1]], [to[0], to[1]]);
  const mid = proj.point(at(0.5));
  const before = proj.point(at(0.47));
  const after = proj.point(at(0.53));
  if (!mid || !before || !after) return null;
  return { at: mid, angle: (Math.atan2(after[1] - before[1], after[0] - before[0]) * 180) / Math.PI };
}

/** A zoom within the pinch's range; `floor` lower while a long route is framed below the rest size (routeZoom). */
export const clampZoom = (z: number, floor: number = GLOBE_SPEC.zoom.min) =>
  Math.min(GLOBE_SPEC.zoom.max, Math.max(floor, z));
export const clampTilt = (phi: number) => Math.min(GLOBE_SPEC.tilt.max, Math.max(GLOBE_SPEC.tilt.min, phi));

/** The view the gestures move and the engine eases: a rotation and a zoom. */
export type View = { rotation: Rotation; zoom: number };

export const OPENING_VIEW: View = { rotation: GLOBE_SPEC.opening, zoom: 1 };

/** 13: the view's centre this far toward the equator from the route's middle, so the great circle bows up as an arc
 *  instead of crossing the globe as a straight line (a great circle through the centre of view is one). */
export const ROUTE_TILT_DEG = 30;
/** How far from the view's centre a route's ends may stand once tilted: on the near side Mapbox draws (80°). */
export const ROUTE_REACH_DEG = 78;

/**
 * The tilt for a route `halfDeg` degrees long from end to middle: the full 30° from New York to London on; less for a
 * short one, which the zoom brings so close that a full tilt would lift the globe off its frame (London to Paris is
 * nearly level); less again for one nearly across the world, so both ends stay within ROUTE_REACH_DEG of the centre
 * (New York to Singapore) — the middle is `halfDeg` from either end, the centre `tilt` from the middle.
 */
export function routeTilt(halfDeg: number): number {
  return Math.max(0, Math.min(ROUTE_TILT_DEG, 1.25 * halfDeg, ROUTE_REACH_DEG - halfDeg));
}

/** A chosen route's view: where the globe turns and how close it comes, and how far the globe's centre stands below the
 *  route's middle on screen — the arc rises above the centre of view, and `lift` brings it back to the band's middle. */
export type RouteFrame = View & { lift: number };

/**
 * Where a chosen route is held (13): seen from nearer the equator, so it arcs; the globe zoomed so the whole arc fits
 * ROUTE_BOX — closer for a short route, further out for a long one — and lifted so the arc sits in the box's middle.
 * Without a home airport the destination is centred.
 */
export function routeView(from: LonLat | null, to: LonLat): RouteFrame {
  const start = from ?? to;
  const at = geoInterpolate([start[0], start[1]], [to[0], to[1]]);
  const [lng, lat] = at(0.5);
  // No home airport yet (onboarding skipped): the destination alone, closer than at rest.
  if (!from || geoDistance([from[0], from[1]], [to[0], to[1]]) < 1e-6) {
    return { rotation: [normalizeLambda(-lng), clampTilt(-lat)], zoom: 2, lift: 0 };
  }
  const tilt = routeTilt((geoDistance([start[0], start[1]], [to[0], to[1]]) * 90) / Math.PI);
  const centreLat = lat >= 0 ? lat - tilt : lat + tilt;
  const rotation: Rotation = [normalizeLambda(-lng), clampTilt(-centreLat)];
  // The arc at zoom 1, relative to the centre; the projection scales it linearly with the zoom.
  const proj = projector(GLOBE_SPEC.frame, rotation, 1);
  const c = GLOBE_SPEC.frame / 2;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= 20; i++) {
    const xy = proj.point(at(i / 20));
    if (!xy) continue; // past the horizon: the widest framing below keeps the rest in view
    xs.push(xy[0] - c);
    ys.push(xy[1] - c);
  }
  if (xs.length === 0) return { rotation, zoom: GLOBE_SPEC.routeZoom.min, lift: 0 };
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const fit = Math.min(
    width > 1e-6 ? (2 * ROUTE_BOX.halfWidth) / width : Number.POSITIVE_INFINITY,
    height > 1e-6 ? (2 * ROUTE_BOX.halfHeight) / height : Number.POSITIVE_INFINITY,
  );
  const zoom = Math.min(GLOBE_SPEC.routeZoom.max, Math.max(GLOBE_SPEC.routeZoom.min, fit));
  const middleY = ((Math.max(...ys) + Math.min(...ys)) / 2) * zoom;
  return { rotation, zoom, lift: -middleY };
}

export type Detail = "low" | "mid" | "high";
/** low = 110m (fingers down) · mid = 50m at 1 px² (idle rotation) · high = 50m at 0.1 px² (still, or zoomed in). */
export function detailFor(mode: GlobeMode, interacting: boolean, zoom: number): Detail {
  if (interacting) return "low";
  if (zoom >= GLOBE_SPEC.zoom.detailAbove) return "high";
  return mode === "rotating" || mode === "framing" ? "mid" : "high";
}

/** A drag of (dx, dy) screen px on a globe of radius `radiusPx`: the surface follows the finger. */
export function dragRotation(start: Rotation, dx: number, dy: number, radiusPx: number): Rotation {
  const deg = 180 / Math.PI / radiusPx;
  return [normalizeLambda(start[0] + dx * deg), clampTilt(start[1] - dy * deg)];
}

/**
 * Pan and pinch run together (Gesture.Simultaneous). Each applies only its change since its own previous event, at the zoom
 * of that moment — so one gesture starting or ending never rebases or replays the other, and a pinch in the middle of a
 * drag never rescales the distance already dragged.
 */
export const panBy = (v: View, changeX: number, changeY: number, size: number): View => ({
  rotation: dragRotation(v.rotation, changeX, changeY, radiusFor(size, v.zoom)),
  zoom: v.zoom,
});
export const pinchBy = (v: View, scaleChange: number, floor: number = GLOBE_SPEC.zoom.min): View => ({
  rotation: v.rotation,
  zoom: clampZoom(v.zoom * scaleChange, floor),
});

/** The globe stays touched until the last active gesture ends. */
export const touchesAfter = (active: number, event: "begin" | "end"): number =>
  event === "begin" ? active + 1 : Math.max(0, active - 1);

/** Whether a view has arrived at another, within what a screen can show. */
export const atView = (v: View, target: View) =>
  Math.abs(normalizeLambda(v.rotation[0] - target.rotation[0])) < 0.05 &&
  Math.abs(v.rotation[1] - target.rotation[1]) < 0.05 &&
  Math.abs(v.zoom - target.zoom) < 0.002;
