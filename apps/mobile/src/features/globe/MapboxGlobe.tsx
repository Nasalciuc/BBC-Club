/**
 * The Explore globe on Mapbox (ADR-IMPL-035). Loaded only by Globe.tsx, and only on a build that has the native module:
 * importing @rnmapbox/maps without it throws.
 *
 * Mapbox's satellite-streets style (the owner's choice, 7 Oct 2026): imagery with the names of countries and cities,
 * downloaded the first time a region is seen, then served from Mapbox's cache. Our pins and route sit above it.
 * Figma: P3.1 Home · Rest (89:386), P3.2 London selected (89:387), Globe · Map style (482:1115), page 06 · Motion,
 * 07 · Additions A6 (536:11212).
 */
import Mapbox, {
  Atmosphere,
  Camera,
  CircleLayer,
  FillLayer,
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
  nightPolygon,
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
/** A6 · CINEMATIC FLIGHT: the camera flies the great circle to a chosen destination in under a second; Motion spec 4:
 *  the route then draws itself in 600 ms, home to destination. Back to Rest is the old ease. */
const MOVE_MS = { frame: 900, flight: 950, arc: 600, zoom: 500 } as const;
const ARC_TICK_MS = 30;
/** A6 · DAY AND NIGHT: the dark side, shaded from the real time, updated every minute. */
const NIGHT_TICK_MS = 60_000;
const NIGHT_OPACITY = 0.35;

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
  /** The map has loaded and drawn: Globe fades it in over the drawn globe (A6 · INSTANT GLOBE). */
  onReady: () => void;
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
  onReady,
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
  // Once the style is in, a failing tile, glyph or sprite is a blemish, not a dead map: only an error before the style
  // loaded hands Explore back to the drawn globe (onMapLoadingError fires for any of them, repeatedly).
  const styleLoaded = useRef(false);
  // How much of the route is drawn, 0..1 — Motion spec 4 reveals it in route order once the flight has landed.
  const [arc, setArc] = useState(1);
  // The night side, recomputed on the minute while the globe is visible (one GeoJSON in state: the halo and arc ticks
  // re-render without rebuilding it).
  const [night, setNight] = useState(() => nightPolygon(new Date()));

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

  // The night side follows the clock while the globe is on screen; a globe coming back from the background catches up.
  useEffect(() => {
    if (!appActive || hidden) return;
    setNight(nightPolygon(new Date()));
    const t = setInterval(() => setNight(nightPolygon(new Date())), NIGHT_TICK_MS);
    return () => clearInterval(t);
  }, [appActive, hidden]);

  // A chosen destination flies the camera along the great circle and frames the route above the sheet; clearing it
  // eases the globe back to the rest position.
  const dest = pins.find((p) => p.code === selected) ?? null;
  const destLat = dest?.lat;
  const destLng = dest?.lng;
  const homeLat = home?.lat;
  const homeLng = home?.lng;
  useEffect(() => {
    if (!mapReady) return;
    // A programmatic move counts as a touch: the slow turn waits until this framing has settled.
    view.current.touchedAt = Date.now();
    if (destLat === undefined || destLng === undefined) {
      camera.current?.setCamera({
        // Back to Figma's opening view: the idle turn resumes from there, not from the last route.
        centerCoordinate: [...OPENING_CENTER],
        zoomLevel: FIGMA_ZOOM,
        padding: globePadding("rest", size.height),
        animationDuration: reducedMotion ? 0 : MOVE_MS.frame,
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
      animationDuration: reducedMotion ? 0 : MOVE_MS.flight,
      animationMode: reducedMotion ? "easeTo" : "flyTo",
    });
  }, [mapReady, destLat, destLng, homeLat, homeLng, size.width, size.height, reducedMotion]);

  // The route draws itself, home to destination, in 600 ms once the flight has landed (Motion spec 4). Reduce motion
  // shows it whole at once, as the Figma RM frames do.
  useEffect(() => {
    if (destLat === undefined || destLng === undefined || homeLat === undefined || homeLng === undefined) return;
    if (reducedMotion || !mapReady) {
      setArc(1);
      return;
    }
    setArc(0);
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      const began = Date.now();
      interval = setInterval(() => {
        const progress = Math.min(1, (Date.now() - began) / MOVE_MS.arc);
        setArc(progress);
        if (progress >= 1 && interval) clearInterval(interval);
      }, ARC_TICK_MS);
    }, MOVE_MS.flight);
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [mapReady, destLat, destLng, homeLat, homeLng, reducedMotion]);

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
        onMapLoadingError={() => {
          if (!styleLoaded.current) onFailed();
        }}
        onDidFinishLoadingStyle={() => {
          styleLoaded.current = true;
        }}
        // Loaded, or idle with what could be loaded (a tile may have failed): either way there is a globe to show.
        onDidFinishLoadingMap={() => {
          setMapReady(true);
          onReady();
        }}
        onMapIdle={() => {
          if (!styleLoaded.current) return;
          setMapReady(true);
          onReady();
        }}
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
        <ShapeSource id="night" shape={night}>
          <FillLayer
            id="night-shade"
            style={{ fillColor: tokens.colors.surfaceNight, fillOpacity: NIGHT_OPACITY, fillAntialias: false }}
          />
        </ShapeSource>
        {line ? (
          // lineMetrics: line-trim-offset is measured along the line and needs the source to carry those metrics.
          <ShapeSource id="route" shape={line} lineMetrics>
            <LineLayer
              id="route-line"
              style={{
                lineColor: tokens.colors.textOnDark,
                lineWidth: GLOBE_SPEC.arcStroke,
                // Figma: 4 px dash, 4 px gap. Mapbox measures dashes in line widths.
                lineDasharray: GLOBE_SPEC.arcDash.map((d) => d / GLOBE_SPEC.arcStroke),
                // The undrawn part of the route is transparent: [drawn so far, end].
                lineTrimOffset: [arc, 1],
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
