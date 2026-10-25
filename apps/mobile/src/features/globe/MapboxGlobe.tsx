/**
 * The Explore globe on Mapbox (ADR-IMPL-035, ADR-IMPL-055). Loaded only by Globe.tsx, and only on a build that has the
 * native module: importing @rnmapbox/maps without it throws.
 *
 * The Earth by day, as Mapbox's satellite imagery shows it, without names — downloaded the first time a region is seen,
 * then served from Mapbox's cache — on the pale sky (02). Our pins and their labels are React views on the map
 * (MarkerView); a chosen route is a white line with its plane, framed over the sheet (13).
 */
import Mapbox, {
  Atmosphere,
  BackgroundLayer,
  Camera,
  LineLayer,
  MapView,
  MarkerView,
  ShapeSource,
  type MapState,
} from "@rnmapbox/maps";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  type LayoutChangeEvent,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import {
  GLOBE_SPEC,
  GlobePin,
  Icon,
  RouteEnd,
  OPENING_CENTER,
  REST_ZOOM,
  ZOOM_RANGE,
  createPressGuard,
  globePadding,
  labelScale,
  mapPoint,
  mapboxPress,
  pinFrame,
  pinPriority,
  placeLabels,
  routeCamera,
  routeEndFrame,
  routeLine,
  routeMiddle,
  tokens,
  type GlobeCamera,
  type GlobeTap,
  type LngLat,
  type Pin,
  type PinToPlace,
  type RouteEndKind,
  type Rect,
} from "@bbc/ui";

import { env } from "@/lib/env";

void Mapbox.setAccessToken(env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");
// No usage telemetry. Mapbox still counts one anonymous monthly active user for billing (docs/store/data-safety.md).
Mapbox.setTelemetryEnabled(false);

/** The Earth as photographed, without names (the owner's reference, 13 Oct 2026). A map that cannot load falls back to
 *  the drawn globe. */
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-v9";
/**
 * The black globe's floor (ADR-IMPL-068, over the air): satellite-v9 paints its background layer, rgb(4,7,14), wherever
 * a tile is missing — a sphere of near-black where the imagery did not come. Recoloured to the drawn globe's deep ocean,
 * a missing tile shows the sea instead.
 */
const BACKGROUND = { backgroundColor: tokens.colors.globeOceanDeep } as const;
/** 02: the globe on the pale sky, a white haze at its rim, no stars. */
const ATMOSPHERE = {
  color: tokens.colors.surfaceCard,
  highColor: tokens.colors.sky,
  horizonBlend: 0.06,
  spaceColor: tokens.colors.sky,
  starIntensity: 0,
} as const;

/** One turn in 120 s is 3° a second, west; resume 4 s after the last touch (GLOBE_SPEC). */
const TURN_DEG_PER_S = 360 / (GLOBE_SPEC.periodMs / 1000);
/** The camera flies the great circle to a chosen destination in under a second; the route then draws itself in 600 ms,
 *  home to destination. Back to rest is an ease. */
const MOVE_MS = { frame: 900, flight: 950, arc: 600 } as const;
const ARC_TICK_MS = 30;

/** The globe was touched now: the slow turn waits 4 s from here. */
function touched(view: { touchedAt: number }) {
  view.touchedAt = Date.now();
}

export type MapboxGlobeProps = {
  pins: Pin[];
  home: { lat: number; lng: number; code?: string } | null;
  selected: string | null;
  onSelect: (code: string) => void;
  /** Where the globe's centre stands on screen (explore-layout). */
  centreY: number;
  /** The band the labels may use, on screen: under the greeting, over the sheet — and what they must not cover. */
  band: { top: number; bottom: number; avoid?: readonly Rect[] };
  /** The sheet's top: Mapbox's logo and attribution must stay visible just above it. */
  sheetTop: number;
  /**
   * Explore is not on screen — another tab, or a screen pushed over it — or the sheet covers the globe: the globe stays
   * drawn but nothing turns.
   */
  paused?: boolean;
  /** The map could not load (a bad token, a style error): Globe draws the fallback instead of a blank screen. */
  onFailed: () => void;
  /** The map has loaded and drawn: Globe fades it in over the drawn globe. */
  onReady: () => void;
  /** A press on the globe that is no pin's, at rest (ADR-IMPL-068): the place under the finger. The sky is nothing. */
  onTapPlace?: (tap: GlobeTap) => void;
};

export default function MapboxGlobe({
  pins,
  home,
  selected,
  onSelect,
  centreY,
  band,
  sheetTop,
  paused = false,
  onFailed,
  onReady,
  onTapPlace,
}: MapboxGlobeProps) {
  const camera = useRef<ComponentRef<typeof Camera>>(null);
  const view = useRef({ center: [...OPENING_CENTER] as LngLat, zoom: REST_ZOOM, touchedAt: 0 });
  const [size, setSize] = useState({ width: 393, height: 768 });
  const { fontScale } = useWindowDimensions();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  // The Camera mounts only after the map has its layout: framing waits for the map to finish loading.
  const [mapReady, setMapReady] = useState(false);
  // Once the style is in, a failing tile, glyph or sprite is a blemish, not a dead map: only an error before the style
  // loaded hands Explore back to the drawn globe (onMapLoadingError fires for any of them, repeatedly).
  const styleLoaded = useRef(false);
  // How much of the route is drawn, 0..1 — revealed in route order once the flight has landed.
  const [arc, setArc] = useState(1);
  // Where the camera stands, for the labels: which pins are on the near side, and on which side each label fits.
  const [seen, setSeen] = useState<GlobeCamera>({ center: [...OPENING_CENTER] as LngLat, zoom: REST_ZOOM });
  // ADR-IMPL-068: one choice per touch. @rnmapbox/maps 10.3.7 keeps a press on a MarkerView from the map (iOS ignores the
  // touch, Android absorbs the press), but a press in a pin's hit slop, outside its MarkerView, reaches the map — and on
  // Android may reach the pin too: whichever answers first chooses.
  const [pressGuard] = useState(() => createPressGuard());

  const moving = appActive && !paused && !reducedMotion;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    const app = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => {
      motion.remove();
      app.remove();
    };
  }, []);

  // The slow turn, while nothing is chosen and nobody has touched the globe for 4 s. It eases back to the rest zoom and
  // latitude as it turns, as the drawn globe does.
  useEffect(() => {
    if (!moving || selected !== null) return;
    const t = setInterval(() => {
      const v = view.current;
      if (Date.now() - v.touchedAt < GLOBE_SPEC.idleResumeMs) return;
      const [lng, lat] = v.center;
      camera.current?.setCamera({
        centerCoordinate: [lng - TURN_DEG_PER_S, lat + (OPENING_CENTER[1] - lat) * 0.2],
        zoomLevel: v.zoom + (REST_ZOOM - v.zoom) * 0.2,
        animationDuration: 1000,
        animationMode: "linearTo",
      });
    }, 1000);
    return () => clearInterval(t);
  }, [moving, selected]);

  // A chosen destination flies the camera along the great circle and frames the route over the sheet (13); clearing it
  // eases the globe back to the rest view (02).
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
        centerCoordinate: [...OPENING_CENTER],
        zoomLevel: REST_ZOOM,
        padding: globePadding(centreY, size.height),
        animationDuration: reducedMotion ? 0 : MOVE_MS.frame,
        animationMode: "easeTo",
      });
      return;
    }
    const from = homeLat === undefined || homeLng === undefined ? null : { lat: homeLat, lng: homeLng };
    const cam = routeCamera(from, { lat: destLat, lng: destLng });
    camera.current?.setCamera({
      centerCoordinate: cam.center,
      zoomLevel: cam.zoom,
      // The arc rises above the camera's centre: the centre stands `lift` lower, so the arc lands mid-band (13).
      padding: globePadding(centreY + cam.lift, size.height),
      animationDuration: reducedMotion ? 0 : MOVE_MS.flight,
      animationMode: reducedMotion ? "easeTo" : "flyTo",
    });
  }, [mapReady, destLat, destLng, homeLat, homeLng, centreY, size.height, reducedMotion]);

  // The route draws itself, home to destination, in 600 ms once the flight has landed. Reduced motion shows it whole.
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
    // The labels follow the camera in steps: a re-render only when the view has moved enough to change them.
    if (
      Math.abs(lng - seen.center[0]) > 0.5 ||
      Math.abs(lat - seen.center[1]) > 0.5 ||
      Math.abs(s.properties.zoom - seen.zoom) > 0.03
    ) {
      setSeen({ center: [lng, lat], zoom: s.properties.zoom });
    }
  }

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  }

  // The pins: every destination at rest (02), the route's two ends once one is chosen (13) — each where the camera
  // shows it, with its label where it fits.
  const lift = dest && home ? routeCamera(home, dest).lift : 0;
  const centre = { x: size.width / 2, y: centreY + lift };
  const shown: (PinToPlace & { lng: number; lat: number; pin: Pin | null })[] = [];
  // A chosen route's two ends with their codes (13), drawn apart: never hidden, never a target.
  const ends: { code: string; lng: number; lat: number; end: RouteEndKind; testID: string }[] = [];
  if (dest) {
    ends.push({ code: dest.code, lng: dest.lng, lat: dest.lat, end: "destination", testID: `globe.pin.${dest.code}` });
    if (home?.code) ends.push({ code: home.code, lng: home.lng, lat: home.lat, end: "origin", testID: "globe.home" });
  } else {
    for (const p of pins) {
      const at = mapPoint(p, seen, centre);
      if (!at) continue;
      const lines = [p.city ?? p.code, p.fromPrice].filter((l) => l.length > 0);
      const priority = pinPriority({ selected: false, home: false, hasOffer: p.hasOffer, price: p.price ?? 0 });
      shown.push({ code: p.code, ...at, lines, priority, lng: p.lng, lat: p.lat, pin: p });
    }
  }
  const placed = placeLabels(
    shown,
    { left: 8, top: band.top, right: size.width - 8, bottom: band.bottom },
    band.avoid ?? [],
    labelScale(fontScale),
  );

  const line = dest && home ? routeLine(home, dest) : null;
  const middle = dest && home ? routeMiddle(home, dest) : null;
  // ADR-IMPL-068: with the globe's tap, a press at rest — whose it is, `mapboxPress` decides (globe-tap.ts). On a pin's
  // 44-pt target it is the pin's: the map gets the press in the ring outside the MarkerView, where the pin's own press
  // does not reach, and chooses the pin through the guard. On the sky — Mapbox answers it with a place on its horizon,
  // which Android reports reprojected onto the limb, not where the finger was — it is nothing; elsewhere on the disc, the
  // place under the finger. Without the tap (no list to snap to) a press only pauses the turn, as before.
  function onMapPress(feature: {
    geometry: { coordinates: number[] };
    properties: { screenPointX: number; screenPointY: number };
  }) {
    touched(view.current); // a press is a touch: the slow turn pauses for it too
    if (!onTapPlace) return;
    const [lng, lat] = feature.geometry.coordinates;
    if (lng === undefined || lat === undefined) return;
    const cam: GlobeCamera = { center: [...view.current.center] as LngLat, zoom: view.current.zoom };
    const screen = { x: feature.properties.screenPointX, y: feature.properties.screenPointY };
    // The map view's height: how far Mapbox's camera stands, so where its horizon is at this zoom.
    const seenThen = { camera: cam, centre, viewHeight: size.height, placed, route: selected !== null };
    const choice = mapboxPress({ lng, lat, screen }, seenThen, pressGuard);
    if (choice?.kind === "pin") {
      if (pressGuard.choose(choice.code)) onSelect(choice.code);
    } else if (choice?.kind === "place") {
      onTapPlace(choice.tap);
    }
  }

  // Mapbox's terms: logo and attribution always visible — just above the sheet.
  const ornament = { bottom: Math.max(8, size.height - sheetTop + 8) };

  return (
    // `globe.map`: the satellite globe's surface, which takes the pan, the pinch and (ADR-IMPL-068) the tap — as
    // `globe.drawn` is the drawn one's. No accessibilityLabel: Search is the screen reader's way to a city.
    <View testID="globe.map" style={StyleSheet.absoluteFill} onLayout={onLayout}>
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
        // Loaded (Mapbox's MapLoaded: the style in and every visible tile rendered), or idle with what could be loaded
        // (a tile may have failed): either way there is a globe to show. Not onDidFinishRenderingMapFully:
        // @rnmapbox/maps 10.3.7 never emits it.
        onDidFinishLoadingMap={() => {
          setMapReady(true);
          onReady();
        }}
        onMapIdle={() => {
          if (!styleLoaded.current) return;
          setMapReady(true);
          onReady();
        }}
        onPress={onMapPress}
      >
        <BackgroundLayer id="background" existing style={BACKGROUND} />
        <Atmosphere style={ATMOSPHERE} />
        <Camera
          ref={camera}
          defaultSettings={{
            centerCoordinate: [...OPENING_CENTER],
            zoomLevel: REST_ZOOM,
            padding: globePadding(centreY, size.height),
          }}
          // Members pinch from the rest size to 3×; only a long route's framing may go below it.
          minZoomLevel={selected === null ? REST_ZOOM : ZOOM_RANGE.min}
          maxZoomLevel={ZOOM_RANGE.max}
        />
        {line ? (
          // lineMetrics: line-trim-offset is measured along the line and needs the source to carry those metrics.
          <ShapeSource id="route" shape={line} lineMetrics>
            <LineLayer
              id="route-line"
              style={{
                lineColor: tokens.colors.textOnPhoto,
                lineWidth: GLOBE_SPEC.routeStroke,
                lineCap: "round",
                // The undrawn part of the route is transparent: [drawn so far, end].
                lineTrimOffset: [arc, 1],
              }}
            />
          </ShapeSource>
        ) : null}
        {middle && arc >= 1 ? (
          <MarkerView coordinate={middle.at} allowOverlap>
            <View style={[styles.plane, { transform: [{ rotate: `${middle.bearing}deg` }] }]} pointerEvents="none">
              <Icon name="plane-fill" size={18} color={tokens.colors.textOnPhoto} />
            </View>
          </MarkerView>
        ) : null}
        {ends.map((e) => {
          const f = routeEndFrame(e.code, e.end);
          return (
            <MarkerView
              key={e.testID}
              coordinate={[e.lng, e.lat]}
              anchor={{ x: f.tip.x / f.width, y: f.tip.y / f.height }}
              allowOverlap
            >
              <RouteEnd inline testID={e.testID} x={0} y={0} code={e.code} end={e.end} />
            </MarkerView>
          );
        })}
        {placed.map((p) => {
          const s = shown.find((x) => x.code === p.code);
          if (!s) return null;
          const label = p.label?.box ?? null;
          const f = pinFrame(p.x, p.y, label);
          const pin = s.pin;
          const name = pin?.city ?? pin?.code ?? home?.code ?? "Home";
          return (
            <MarkerView
              key={p.code}
              coordinate={[s.lng, s.lat]}
              anchor={{ x: f.tip.x / f.width, y: f.tip.y / f.height }}
              allowOverlap
            >
              <GlobePin
                inline
                testID={pin ? `globe.pin.${pin.code}` : "globe.home"}
                x={p.x}
                y={p.y}
                lines={p.lines}
                label={label}
                accessibilityLabel={pin ? (pin.fromPrice ? `${name}, from ${pin.fromPrice}` : name) : `Home, ${name}`}
                onPress={
                  pin && pin.code !== selected
                    ? () => {
                        view.current.touchedAt = Date.now();
                        // With the globe's tap, the guard tells the map's press of the same touch that it was the pin's.
                        if (!onTapPlace || pressGuard.choose(pin.code)) onSelect(pin.code);
                      }
                    : undefined
                }
              />
            </MarkerView>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  plane: { width: GLOBE_SPEC.plane, height: GLOBE_SPEC.plane, alignItems: "center", justifyContent: "center" },
});
