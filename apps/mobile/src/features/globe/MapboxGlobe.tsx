/**
 * The Explore globe on Mapbox (ADR-IMPL-035). Loaded only by Globe.tsx, and only on a build that has the native module:
 * importing @rnmapbox/maps without it throws.
 *
 * The style is written here, not in Mapbox Studio: the same Natural Earth land as the drawn globe, Figma's colours
 * from tokens, no labels, no roads, no tiles to download. Figma: P3.1 Home · Rest (89:386), P3.2 London selected
 * (89:387), Globe · Map style (482:1115), page 06 · Motion.
 */
import Mapbox, {
  Atmosphere,
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  ShapeSource,
  type MapState,
} from "@rnmapbox/maps";
import { type ComponentProps, type ComponentRef, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, type LayoutChangeEvent, StyleSheet, View } from "react-native";

import {
  FIGMA_ZOOM,
  GLOBE_SPEC,
  OPENING_CENTER,
  ZOOM_RANGE,
  globePadding,
  haloOpacity,
  homeSheetHeight,
  pickPin,
  pinFeatures,
  routeCamera,
  routeLine,
  tokens,
  type LngLat,
  type Pin,
} from "@bbc/ui";

import { env } from "@/lib/env";

void Mapbox.setAccessToken(env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");
// No usage telemetry. Mapbox still counts one anonymous monthly active user for billing (docs/store/data-safety.md).
Mapbox.setTelemetryEnabled(false);

/**
 * The Earth as photographed, with the names of countries and cities, under an atmosphere and stars — Mapbox's globe
 * example (the owner's choice, 7 Oct 2026 — ADR-IMPL-035, amended). Our route and pins are added after the style, so
 * they sit above its labels. Imagery needs the network the first time; Mapbox caches what was seen. A map that cannot
 * load falls back to the drawn globe.
 */
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
/** Mapbox's satellite-globe atmosphere: a pale horizon, a deep-blue sky, near-black space with stars. */
const ATMOSPHERE = {
  color: tokens.colors.globeAtmosphere,
  highColor: tokens.colors.globeAtmosphereHigh,
  horizonBlend: 0.02,
  spaceColor: tokens.colors.globeSpace,
  starIntensity: 0.6,
} as const;

/** The library does not export its press-event type; the one ShapeSource hands its onPress is the same. */
type OnPressEvent = Parameters<NonNullable<ComponentProps<typeof ShapeSource>["onPress"]>>[0];

/** Figma Motion: one turn in 120 s is 3° a second, west; resume 4 s after the last touch (GLOBE_SPEC). */
const TURN_DEG_PER_S = 360 / (GLOBE_SPEC.periodMs / 1000);
const HALO_TICK_MS = 200;
const MOVE_MS = { frame: 900, zoom: 500 } as const;

export type MapboxGlobeProps = {
  pins: Pin[];
  home: { lat: number; lng: number } | null;
  selected: string | null;
  onSelect: (code: string) => void;
  state: "rest" | "selected";
  /** The sheet's snap index: Mapbox's logo and attribution must stay visible just above it. */
  sheetIndex: number;
  /** The sheet covers the globe (searching, expanded): keep the map mounted, stop the motion. */
  hidden: boolean;
  /** The map could not load (a bad token, a style error): Globe draws the fallback instead of a blank screen. */
  onFailed: () => void;
};

export default function MapboxGlobe({
  pins,
  home,
  selected,
  onSelect,
  state,
  sheetIndex,
  hidden,
  onFailed,
}: MapboxGlobeProps) {
  const camera = useRef<ComponentRef<typeof Camera>>(null);
  const view = useRef({ center: [...OPENING_CENTER] as LngLat, zoom: FIGMA_ZOOM, touchedAt: 0 });
  const [size, setSize] = useState({ width: 393, height: 768 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [clock, setClock] = useState(0);
  const [a11yIndex, setA11yIndex] = useState(0);
  // The Camera mounts only after the map has its layout: framing waits for the map to finish loading.
  const [mapReady, setMapReady] = useState(false);

  const moving = appActive && !hidden && !reducedMotion;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    const app = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => {
      motion.remove();
      app.remove();
    };
  }, []);

  // Offer halos pulse (Figma Motion, 2 s); reduced motion, background or a covered globe holds them still.
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => setClock(Date.now()), HALO_TICK_MS);
    return () => clearInterval(t);
  }, [moving]);

  // The slow turn, while nothing is chosen and nobody has touched the globe for 4 s. It eases back to Figma's zoom
  // and latitude as it turns, as the drawn globe does.
  useEffect(() => {
    if (!moving || selected !== null) return;
    const t = setInterval(() => {
      const v = view.current;
      if (Date.now() - v.touchedAt < GLOBE_SPEC.idleResumeMs) return;
      const [lng, lat] = v.center;
      camera.current?.setCamera({
        centerCoordinate: [lng - TURN_DEG_PER_S, lat + (OPENING_CENTER[1] - lat) * 0.2],
        zoomLevel: v.zoom + (FIGMA_ZOOM - v.zoom) * 0.2,
        animationDuration: 1000,
        animationMode: "linearTo",
      });
    }, 1000);
    return () => clearInterval(t);
  }, [moving, selected]);

  // A chosen destination frames its route above the sheet; clearing it hands the globe back to the rest position.
  const dest = pins.find((p) => p.code === selected) ?? null;
  const destLat = dest?.lat;
  const destLng = dest?.lng;
  const homeLat = home?.lat;
  const homeLng = home?.lng;
  useEffect(() => {
    if (!mapReady) return;
    // A programmatic move counts as a touch: the slow turn waits until this framing has settled.
    view.current.touchedAt = Date.now();
    const duration = reducedMotion ? 0 : MOVE_MS.frame;
    if (destLat === undefined || destLng === undefined) {
      camera.current?.setCamera({
        // Back to Figma's opening view: the idle turn resumes from there, not from the last route.
        centerCoordinate: [...OPENING_CENTER],
        zoomLevel: FIGMA_ZOOM,
        padding: globePadding("rest", size.height),
        animationDuration: duration,
        animationMode: "easeTo",
      });
      return;
    }
    const from = homeLat === undefined || homeLng === undefined ? null : { lat: homeLat, lng: homeLng };
    const cam = routeCamera(from, { lat: destLat, lng: destLng }, size.width);
    camera.current?.setCamera({
      centerCoordinate: cam.center,
      zoomLevel: cam.zoom,
      padding: globePadding("selected", size.height),
      animationDuration: duration,
      animationMode: "easeTo",
    });
  }, [mapReady, destLat, destLng, homeLat, homeLng, size.width, size.height, reducedMotion]);

  function onCameraChanged(s: MapState) {
    const [lng = OPENING_CENTER[0], lat = OPENING_CENTER[1]] = s.properties.center;
    view.current.center = [lng, lat];
    view.current.zoom = s.properties.zoom;
    if (s.gestures.isGestureActive) view.current.touchedAt = Date.now();
  }

  function onPinPress(e: OnPressEvent) {
    view.current.touchedAt = Date.now();
    const candidates = e.features.flatMap((f) => {
      const p = f.properties as { code?: unknown; home?: unknown } | null;
      if (f.geometry.type !== "Point" || p?.home === true || typeof p?.code !== "string") return [];
      const [lng = 0, lat = 0] = f.geometry.coordinates;
      return [{ code: p.code, lng, lat }];
    });
    const pick = pickPin([e.coordinates.longitude, e.coordinates.latitude], candidates, view.current.zoom);
    if (pick.kind === "pin") onSelect(pick.code);
    if (pick.kind === "zoom") {
      camera.current?.setCamera({
        centerCoordinate: pick.center,
        zoomLevel: Math.min(ZOOM_RANGE.max, view.current.zoom + 1),
        padding: globePadding(state, size.height),
        animationDuration: reducedMotion ? 0 : MOVE_MS.zoom,
        animationMode: "easeTo",
      });
    }
  }

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  }

  // Screen readers cannot see a map: swiping up and down walks the destinations, a double tap chooses one.
  const focus = pins.length ? pins[((a11yIndex % pins.length) + pins.length) % pins.length] : undefined;
  const focusText = focus
    ? [focus.city ?? focus.code, focus.fromPrice ? `from ${focus.fromPrice}` : ""].filter(Boolean).join(", ")
    : "No destinations";

  const halo = haloOpacity(clock, !moving);
  const line = dest && home ? routeLine(home, dest) : null;
  // Mapbox's terms: logo and attribution always visible — just above wherever the sheet rests.
  const ornament = { bottom: homeSheetHeight(sheetIndex, size.height) + 8 };
  const accent = tokens.colors.accentWarm;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Globe of destinations"
      accessibilityValue={{ text: focusText }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "activate" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "increment") setA11yIndex((i) => i + 1);
        if (e.nativeEvent.actionName === "decrement") setA11yIndex((i) => i - 1);
        if (e.nativeEvent.actionName === "activate" && focus) onSelect(focus.code);
      }}
    >
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={SATELLITE_STYLE}
        projection="globe"
        rotateEnabled={false}
        pitchEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        logoPosition={{ bottom: ornament.bottom, left: 8 }}
        attributionPosition={{ bottom: ornament.bottom, right: 8 }}
        onCameraChanged={onCameraChanged}
        onMapLoadingError={onFailed}
        onDidFinishLoadingMap={() => setMapReady(true)}
        // A tap on the ocean moves nothing, but it is a touch: the slow turn pauses for it too.
        onPress={() => {
          view.current.touchedAt = Date.now();
        }}
      >
        <Atmosphere style={ATMOSPHERE} />
        <Camera
          ref={camera}
          defaultSettings={{
            centerCoordinate: [...OPENING_CENTER],
            zoomLevel: FIGMA_ZOOM,
            padding: globePadding("rest", size.height),
          }}
          // Members pinch from Figma's 1× to 3×; only a long route's framing may go below 1×.
          minZoomLevel={selected === null ? FIGMA_ZOOM : ZOOM_RANGE.min}
          maxZoomLevel={ZOOM_RANGE.max}
        />
        {line ? (
          <ShapeSource id="route" shape={line}>
            <LineLayer
              id="route-line"
              style={{
                lineColor: tokens.colors.textOnDark,
                lineWidth: GLOBE_SPEC.arcStroke,
                // Figma: 4 px dash, 4 px gap. Mapbox measures dashes in line widths.
                lineDasharray: GLOBE_SPEC.arcDash.map((d) => d / GLOBE_SPEC.arcStroke),
              }}
            />
          </ShapeSource>
        ) : null}
        <ShapeSource
          id="pins"
          shape={pinFeatures(pins, selected, home)}
          onPress={onPinPress}
          hitbox={{ width: GLOBE_SPEC.pin.hit, height: GLOBE_SPEC.pin.hit }}
        >
          <CircleLayer
            id="pin-halo"
            filter={["all", ["!", ["get", "home"]], ["any", ["get", "hasOffer"], ["get", "selected"]]]}
            style={{
              circleRadius: GLOBE_SPEC.pin.halo / 2,
              circleColor: ["case", ["get", "selected"], accent, tokens.colors.textOnDark],
              circleOpacity: halo,
            }}
          />
          <CircleLayer
            id="pin-dot"
            style={{
              circleRadius: [
                "case",
                ["any", ["get", "hasOffer"], ["get", "selected"]],
                GLOBE_SPEC.pin.offerDot / 2,
                GLOBE_SPEC.pin.dot / 2,
              ],
              circleColor: [
                "case",
                ["get", "selected"],
                accent,
                ["get", "hasOffer"],
                tokens.colors.textOnDark,
                tokens.colors.textOnDarkMuted,
              ],
              // Over bright imagery (desert, snow, cloud) a thin night ring keeps the dot readable.
              circleStrokeColor: tokens.colors.surfaceNight,
              circleStrokeWidth: 1.5,
            }}
          />
        </ShapeSource>
      </MapView>
    </View>
  );
}
