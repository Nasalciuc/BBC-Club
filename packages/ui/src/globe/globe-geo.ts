/**
 * Geometry for the Mapbox globe — pure, so it runs under `bun test` like globe-logic.ts.
 * Mapbox draws its globe with radius 512 · 2^zoom / 2π points; every Figma size below is converted through that.
 * Figma: nYP9gogb6hnpKxfpKiCc4g — P3.1 Home · Rest (89:386), P3.2 Home · London selected (89:387).
 */
import { geoDistance, geoInterpolate } from "d3-geo";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";

import { GLOBE_SPEC } from "./globe-logic";

export type LngLat = [number, number];
export type GeoPoint = { lat: number; lng: number };
export type GeoPinInput = { code: string; lat: number; lng: number; hasOffer: boolean };
export type PinProps = { code: string; hasOffer: boolean; selected: boolean; home: boolean };

const TAU = 2 * Math.PI;
const RAD = Math.PI / 180;

/** Mapbox's globe radius, in points, at a zoom level. */
export const radiusAtZoom = (zoom: number): number => (512 * 2 ** zoom) / TAU;
const zoomForRadius = (radius: number): number => Math.log2((radius * TAU) / 512);

/** The zoom whose globe matches Figma's 248-point ocean (≈ 1.605). */
export const FIGMA_ZOOM = zoomForRadius(GLOBE_SPEC.radius);
/** Figma's opening view: centre 30°W 35°N. */
export const OPENING_CENTER: LngLat = [-GLOBE_SPEC.opening[0], -GLOBE_SPEC.opening[1]];
/** Pinch range: Figma's 1× to the owner's 3×. A long route may frame below 1×, never below half. */
export const ZOOM_RANGE = { min: zoomForRadius(GLOBE_SPEC.radius / 2), max: FIGMA_ZOOM + Math.log2(3) } as const;

/** A tap that lands within this many points of two pins at once cannot tell them apart: zoom in instead of guessing. */
export const AMBIGUITY_PT = 8;
/** Both ends this close to the opening centre: keep Figma's opening view (London, Paris, Rome from New York). */
export const KEEP_OPENING_DEG = 40;
/** Room kept between a route end and the screen edge, for the pin and its halo. */
export const EDGE_PT = 32;

/** Figma: where the globe's centre sits on screen — Rest y 92 + 260, a selected route y 8 + 260. */
export const GLOBE_CENTRE_Y = { rest: 352, selected: 268 } as const;

/** Pins for one ShapeSource. Home is drawn (Figma "Pin · JFK", muted) but never picked. */
export function pinFeatures(
  pins: readonly GeoPinInput[],
  selected: string | null,
  home: GeoPoint | null,
): FeatureCollection<Point, PinProps> {
  const features: Feature<Point, PinProps>[] = pins.map((p) => ({
    type: "Feature",
    id: p.code,
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: { code: p.code, hasOffer: p.hasOffer, selected: p.code === selected, home: false },
  }));
  if (home) {
    features.push({
      type: "Feature",
      id: "home",
      geometry: { type: "Point", coordinates: [home.lng, home.lat] },
      properties: { code: "home", hasOffer: false, selected: false, home: true },
    });
  }
  return { type: "FeatureCollection", features };
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

export type Pick = { kind: "pin"; code: string } | { kind: "zoom"; center: LngLat } | { kind: "none" };

/**
 * What a tap means. The nearest pin wins — a finger on Paris is Paris, even with London 13 points away. Only a tap that
 * falls between two pins (their distances within AMBIGUITY_PT) zooms toward them; at the zoom limit the nearest wins.
 */
export function pickPin(
  press: LngLat,
  candidates: readonly { code: string; lng: number; lat: number }[],
  zoom: number,
  maxZoom: number = ZOOM_RANGE.max,
): Pick {
  const r = radiusAtZoom(zoom);
  const ranked = candidates.map((c) => ({ c, pt: geoDistance(press, [c.lng, c.lat]) * r })).sort((x, y) => x.pt - y.pt);
  const first = ranked[0];
  if (!first) return { kind: "none" };
  const second = ranked[1];
  if (second && second.pt - first.pt < AMBIGUITY_PT && zoom < maxZoom - 0.01) {
    const [lng, lat] = geoInterpolate([first.c.lng, first.c.lat], [second.c.lng, second.c.lat])(0.5);
    return { kind: "zoom", center: [lng, lat] };
  }
  return { kind: "pin", code: first.c.code };
}

export type GlobeCamera = { center: LngLat; zoom: number };

/**
 * Where the camera holds a selected route. When both ends sit near the opening view — the case Figma draws — the
 * opening stays, pixel for pixel. Otherwise the great-circle midpoint is centred and the globe zooms out just enough
 * for both ends to fit the screen's width.
 */
export function routeCamera(home: GeoPoint | null, dest: GeoPoint, viewportWidth: number): GlobeCamera {
  const near = (p: GeoPoint) => geoDistance([p.lng, p.lat], OPENING_CENTER) < KEEP_OPENING_DEG * RAD;
  if ((home === null || near(home)) && near(dest)) return { center: [...OPENING_CENTER], zoom: FIGMA_ZOOM };
  const b: LngLat = [dest.lng, dest.lat];
  const a: LngLat = home ? [home.lng, home.lat] : b;
  const [lng, lat] = geoInterpolate(a, b)(0.5);
  const half = geoDistance(a, b) / 2;
  const room = Math.max(EDGE_PT, viewportWidth / 2 - EDGE_PT);
  const fit = half > 1e-6 ? room / Math.sin(Math.min(half, Math.PI / 2)) : Number.POSITIVE_INFINITY;
  const zoom = Math.max(ZOOM_RANGE.min, Math.min(FIGMA_ZOOM, zoomForRadius(fit)));
  return { center: [lng, lat], zoom };
}

/** Bottom padding that puts the globe's centre where Figma has it, on a map view `viewHeight` points tall. */
export function globePadding(state: keyof typeof GLOBE_CENTRE_Y, viewHeight: number) {
  return {
    paddingTop: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingBottom: Math.max(0, Math.round(viewHeight - 2 * GLOBE_CENTRE_Y[state])),
  };
}
