import { describe, expect, it } from "bun:test";
import { geoDistance } from "d3-geo";

import {
  AMBIGUITY_PT,
  EDGE_PT,
  FIGMA_ZOOM,
  OPENING_CENTER,
  ZOOM_RANGE,
  globePadding,
  pickPin,
  pinFeatures,
  radiusAtZoom,
  routeCamera,
  routeLine,
} from "./globe-geo";

const JFK = { lat: 40.6413, lng: -73.7781 };
const LHR = { code: "LHR", lat: 51.47, lng: -0.4543 };
const CDG = { code: "CDG", lat: 49.0097, lng: 2.5479 };
const DXB = { code: "DXB", lat: 25.2532, lng: 55.3657 };
const HND = { code: "HND", lat: 35.5494, lng: 139.7798 };
const SIN = { code: "SIN", lat: 1.3644, lng: 103.9915 };

describe("FIGMA_ZOOM", () => {
  it("draws the globe with Figma's 248-point radius", () => {
    expect(radiusAtZoom(FIGMA_ZOOM)).toBeCloseTo(248, 6);
  });

  it("pinches from 1× to 3× and frames no smaller than half", () => {
    expect(radiusAtZoom(ZOOM_RANGE.max)).toBeCloseTo(744, 6);
    expect(radiusAtZoom(ZOOM_RANGE.min)).toBeCloseTo(124, 6);
  });
});

describe("pinFeatures", () => {
  it("flags the selected pin and adds home, which is never a destination", () => {
    const fc = pinFeatures(
      [
        { ...LHR, hasOffer: true },
        { ...CDG, hasOffer: false },
      ],
      "CDG",
      JFK,
    );
    expect(fc.features.map((f) => f.properties)).toEqual([
      { code: "LHR", hasOffer: true, selected: false, home: false },
      { code: "CDG", hasOffer: false, selected: true, home: false },
      { code: "home", hasOffer: false, selected: false, home: true },
    ]);
    expect(fc.features[0]?.geometry.coordinates).toEqual([LHR.lng, LHR.lat]);
  });

  it("draws no home when there is none", () => {
    expect(pinFeatures([{ ...LHR, hasOffer: false }], null, null).features).toHaveLength(1);
  });
});

describe("routeLine", () => {
  it("runs from home to the destination along a great circle", () => {
    const line = routeLine(JFK, LHR);
    const c = line?.geometry.coordinates ?? [];
    expect(c[0]?.[0]).toBeCloseTo(JFK.lng, 6);
    expect(c[0]?.[1]).toBeCloseTo(JFK.lat, 6);
    expect(c.at(-1)?.[0]).toBeCloseTo(LHR.lng, 6);
    expect(c.at(-1)?.[1]).toBeCloseTo(LHR.lat, 6);
  });

  it("never jumps across the map where it meets the antimeridian (New York → Tokyo)", () => {
    const c = routeLine(JFK, HND)?.geometry.coordinates ?? [];
    expect(c.length).toBe(65);
    for (let i = 1; i < c.length; i++) {
      expect(Math.abs((c[i]?.[0] ?? 0) - (c[i - 1]?.[0] ?? 0))).toBeLessThan(180);
    }
  });

  it("has no line for a zero-length route", () => {
    expect(routeLine(JFK, JFK)).toBeNull();
  });
});

describe("pickPin", () => {
  const pins = [LHR, CDG, DXB];

  it("picks the pin under the finger — Paris, though London is 13 points away", () => {
    expect(pickPin([CDG.lng, CDG.lat], pins, FIGMA_ZOOM)).toEqual({ kind: "pin", code: "CDG" });
    expect(pickPin([LHR.lng, LHR.lat], pins, FIGMA_ZOOM)).toEqual({ kind: "pin", code: "LHR" });
  });

  it("zooms toward two pins when the tap falls between them", () => {
    const between: [number, number] = [(LHR.lng + CDG.lng) / 2, (LHR.lat + CDG.lat) / 2];
    const pick = pickPin(between, pins, FIGMA_ZOOM);
    expect(pick.kind).toBe("zoom");
    if (pick.kind === "zoom") {
      expect(geoDistance(pick.center, between)).toBeLessThan(0.01);
    }
  });

  it("at the zoom limit, picks the nearest instead of zooming again", () => {
    const between: [number, number] = [(LHR.lng + CDG.lng) / 2 + 0.01, (LHR.lat + CDG.lat) / 2];
    expect(pickPin(between, pins, ZOOM_RANGE.max).kind).toBe("pin");
  });

  it("separates the pins once zoomed: the same tap between them still zooms only while it is ambiguous", () => {
    const nearParis: [number, number] = [CDG.lng - 0.3, CDG.lat];
    const d = (p: { lng: number; lat: number }) =>
      geoDistance(nearParis, [p.lng, p.lat]) * radiusAtZoom(FIGMA_ZOOM + 1);
    expect(d(LHR) - d(CDG)).toBeGreaterThan(AMBIGUITY_PT);
    expect(pickPin(nearParis, pins, FIGMA_ZOOM + 1)).toEqual({ kind: "pin", code: "CDG" });
  });

  it("has nothing to pick without pins", () => {
    expect(pickPin([0, 0], [], FIGMA_ZOOM)).toEqual({ kind: "none" });
  });
});

describe("routeCamera", () => {
  it("keeps Figma's opening view for London and Paris", () => {
    expect(routeCamera(JFK, LHR, 393)).toEqual({ center: OPENING_CENTER, zoom: FIGMA_ZOOM });
    expect(routeCamera(JFK, CDG, 393)).toEqual({ center: OPENING_CENTER, zoom: FIGMA_ZOOM });
  });

  it("frames Dubai, Tokyo and Singapore with both ends inside the screen", () => {
    for (const dest of [DXB, HND, SIN]) {
      const cam = routeCamera(JFK, dest, 393);
      expect(cam.center).not.toEqual(OPENING_CENTER);
      expect(cam.zoom).toBeLessThanOrEqual(FIGMA_ZOOM);
      expect(cam.zoom).toBeGreaterThanOrEqual(ZOOM_RANGE.min);
      // each end sits half the route from the centre; on screen that is R·sin(angle) points from the middle
      const halfAngle = geoDistance([JFK.lng, JFK.lat], [dest.lng, dest.lat]) / 2;
      const fromMiddle = radiusAtZoom(cam.zoom) * Math.sin(Math.min(halfAngle, Math.PI / 2));
      expect(fromMiddle).toBeLessThanOrEqual(393 / 2 - EDGE_PT + 1e-6);
    }
  });

  it("centres the destination when there is no home", () => {
    expect(routeCamera(null, SIN, 393).center[0]).toBeCloseTo(SIN.lng, 6);
  });
});

describe("globePadding", () => {
  it("puts the globe's centre where Figma has it on an 852 − 84 point map view", () => {
    expect(globePadding("rest", 768).paddingBottom).toBe(64);
    expect(globePadding("selected", 768).paddingBottom).toBe(232);
  });

  it("never asks for negative padding on a short screen", () => {
    expect(globePadding("rest", 600).paddingBottom).toBe(0);
  });
});
