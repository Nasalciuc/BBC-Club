/**
 * The globe's pure logic — no React Native imports, so all of it runs under `bun test`.
 * Every number marked "Figma" was measured from file nYP9gogb6hnpKxfpKiCc4g on 1 Oct 2026:
 * node 97:435 (Home · London selected / Globe), 482:1115 (Globe · Map style) and page 06 · Motion.
 */
import { geoDistance, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";

export type LonLat = readonly [number, number];
export type Rotation = readonly [number, number]; // d3 rotate([λ, φ]); the view's centre is (-λ, -φ)
export type Point = readonly [number, number];

export const GLOBE_SPEC = {
  frame: 520, //                       Figma: the globe frame
  radius: 248, //                      Figma: Ocean ellipse 496 × 496 at (12, 12)
  opening: [30, -35] as Rotation, //  Figma: centre 30°W 35°N — places JFK, LHR, CDG and DXB within 0.1 px
  periodMs: 120_000, //               Figma Motion: "Globe · 120 seconds"
  haloPeriodMs: 2_000, //             Figma Motion: "Offer halos · 2 seconds"
  haloOpacity: [0.07, 0.14] as const, // Figma Motion: "eases between 0.07 and 0.14"
  arcLift: 0.485, //                  Figma: quadratic control = chord midpoint + 0.485 × chord, away from the centre
  arcStroke: 1.5, //                  Figma: Route arc, 1.5 px
  arcDash: [4, 4] as const, //        Figma: 4 px dash / 4 px gap
  rimOpacity: 0.16, //                Figma: Ocean stroke, text-on-dark-muted at 16 %, 1 px
  pin: { dot: 8, offerDot: 12, halo: 28, hit: 48 }, // Figma: Destination 8 / 12, Offer halo 28, Pin frame 48
  idleResumeMs: 4_000, //             ours: Figma says "resume when idle" without a number
  returnTauMs: 180, //                ours: ease back to the opening position, ~95 % in 540 ms
  zoom: { min: 1, max: 3, detailAbove: 1.5 }, // ours: the owner asked for zoom; not in Figma
  tilt: { min: -80, max: 80 }, //     ours: keeps the poles from flipping while dragging
} as const;

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
  atOpening: boolean; //               the view is at the opening rotation and zoom 1
};
export type GlobeMode = "still" | "rotating" | "paused" | "returning";

/** Priority, top first: background → finger → reduced motion → selection → idle wait → rotation. */
export function globeMode(i: GlobeInputs): GlobeMode {
  if (!i.appActive) return "paused";
  if (i.interacting) return "paused";
  if (i.reducedMotion) return "still"; // Figma: "Globe and halos are still" — and no animated return either
  if (i.selected !== null) return i.atOpening ? "still" : "returning"; // Figma: a stable route at the opening position
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
  const done =
    Math.abs(normalizeLambda(to.rotation[0] - next.rotation[0])) < 0.05 &&
    Math.abs(to.rotation[1] - next.rotation[1]) < 0.05 &&
    Math.abs(to.zoom - next.zoom) < 0.002;
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
    /** Screen point, or null on the far hemisphere (Figma: pins "disappear on the far hemisphere"). */
    point(p: LonLat): Point | null {
      if (!isOnNearSide(p, rotation)) return null;
      const xy = projection([p[0], p[1]]);
      return xy ? [xy[0], xy[1]] : null;
    },
    path: (geo: GeoPermissibleObjects): string => path(geo) ?? "",
    sphere: (): string => path({ type: "Sphere" }) ?? "",
  };
}

/** Figma's route arc: a quadratic Bézier lifted perpendicular to the chord, away from the sphere's centre. */
export function routeArcPath(a: Point, b: Point, centre: Point, lift: number = GLOBE_SPEC.arcLift): string {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-6) return "";
  const mx = (a[0] + b[0]) / 2,
    my = (a[1] + b[1]) / 2;
  let nx = -dy / chord,
    ny = dx / chord;
  if (nx * (mx - centre[0]) + ny * (my - centre[1]) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const cx = mx + nx * lift * chord,
    cy = my + ny * lift * chord;
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}

/** Figma Motion: offer halos ease between 0.07 and 0.14 over 2 s; still (reduced motion) holds 0.14, as the static frames do. */
export function haloOpacity(ms: number, still: boolean): number {
  const [lo, hi] = GLOBE_SPEC.haloOpacity;
  if (still) return hi;
  const t =
    (((ms % GLOBE_SPEC.haloPeriodMs) + GLOBE_SPEC.haloPeriodMs) % GLOBE_SPEC.haloPeriodMs) / GLOBE_SPEC.haloPeriodMs;
  return lo + ((hi - lo) * (1 - Math.cos(2 * Math.PI * t))) / 2;
}

export type Detail = "low" | "mid" | "high";
/** low = 110m (fingers down) · mid = 50m at 1 px² (idle rotation) · high = 50m at 0.1 px² (still, or zoomed in). */
export function detailFor(mode: GlobeMode, interacting: boolean, zoom: number): Detail {
  if (interacting) return "low";
  if (zoom >= GLOBE_SPEC.zoom.detailAbove) return "high";
  return mode === "rotating" || mode === "returning" ? "mid" : "high";
}

export const clampZoom = (z: number) => Math.min(GLOBE_SPEC.zoom.max, Math.max(GLOBE_SPEC.zoom.min, z));
export const clampTilt = (phi: number) => Math.min(GLOBE_SPEC.tilt.max, Math.max(GLOBE_SPEC.tilt.min, phi));

/** A drag of (dx, dy) screen px on a globe of radius `radiusPx`: the surface follows the finger. */
export function dragRotation(start: Rotation, dx: number, dy: number, radiusPx: number): Rotation {
  const deg = 180 / Math.PI / radiusPx;
  return [normalizeLambda(start[0] + dx * deg), clampTilt(start[1] - dy * deg)];
}

/** The view the two gestures move: a pan turns it, a pinch zooms it. */
export type View = { rotation: Rotation; zoom: number };

/**
 * Pan and pinch run together (Gesture.Simultaneous). Each applies only its change since its own previous event, at the zoom
 * of that moment — so one gesture starting or ending never rebases or replays the other, and a pinch in the middle of a
 * drag never rescales the distance already dragged.
 */
export const panBy = (v: View, changeX: number, changeY: number, size: number): View => ({
  rotation: dragRotation(v.rotation, changeX, changeY, radiusFor(size, v.zoom)),
  zoom: v.zoom,
});
export const pinchBy = (v: View, scaleChange: number): View => ({
  rotation: v.rotation,
  zoom: clampZoom(v.zoom * scaleChange),
});

/** The globe stays touched until the last active gesture ends. */
export const touchesAfter = (active: number, event: "begin" | "end"): number =>
  event === "begin" ? active + 1 : Math.max(0, active - 1);

export const atOpening = (rotation: Rotation, zoom: number) =>
  Math.abs(normalizeLambda(rotation[0] - GLOBE_SPEC.opening[0])) < 0.05 &&
  Math.abs(rotation[1] - GLOBE_SPEC.opening[1]) < 0.05 &&
  Math.abs(zoom - 1) < 0.002;
