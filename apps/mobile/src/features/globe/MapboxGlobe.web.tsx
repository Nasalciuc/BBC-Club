/**
 * The Explore globe on Mapbox, on the web (ADR-IMPL-082): the same satellite globe as the phone's (MapboxGlobe.tsx,
 * ADR-IMPL-035), drawn by Mapbox GL JS — @rnmapbox/maps has no globe of its own in a browser. Metro takes this file for
 * the web build; the phone's builds never see it.
 *
 * The Earth by day, as Mapbox's satellite imagery shows it, without names, on the pale sky (02). Our pins, their labels
 * and a chosen route's two ends are React views laid over the map where Mapbox projects each place, moved with the
 * camera; the route is a white line drawn on the map with its plane at the middle (13). Mapbox's logo and attribution
 * stay visible just above the sheet.
 */
import mapboxgl, { type GeoJSONSource, type LngLatLike, type Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, type LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from "react-native";

import {
  GLOBE_SPEC,
  GlobePin,
  Icon,
  OPENING_CENTER,
  REST_ZOOM,
  RouteEnd,
  ZOOM_RANGE,
  createPressGuard,
  globePadding,
  labelScale,
  mapPoint,
  mapboxPress,
  pinPriority,
  placeLabels,
  routeCamera,
  routeLine,
  routeMiddle,
  tokens,
  type GlobeCamera,
  type LngLat,
  type Pin,
  type PinToPlace,
  type RouteEndKind,
} from "@bbc/ui";

import { env } from "@/lib/env";

import type { MapboxGlobeProps } from "./MapboxGlobe";

export type { MapboxGlobeProps } from "./MapboxGlobe";

/** The same imagery as the phone's globe (MapboxGlobe.tsx). */
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-v9";
/** 02: the globe on the pale sky, a white haze at its rim, no stars — as the phone's Atmosphere. */
const FOG = {
  color: tokens.colors.surfaceCard,
  "high-color": tokens.colors.sky,
  "horizon-blend": 0.06,
  "space-color": tokens.colors.sky,
  "star-intensity": 0,
} as const;
/** One turn in 120 s, west; resume 4 s after the last touch (GLOBE_SPEC), as on the phone. */
const TURN_DEG_PER_S = 360 / (GLOBE_SPEC.periodMs / 1000);
const MOVE_MS = { frame: 900, flight: 950, arc: 600 } as const;
const ARC_TICK_MS = 30;
const ROUTE_SOURCE = "route";
const ROUTE_LAYER = "route-line";

/** Mapbox GL's padding from the phone's (`globePadding` speaks @rnmapbox's names). */
function padding(centreY: number, height: number) {
  const p = globePadding(centreY, height);
  return { top: p.paddingTop, bottom: p.paddingBottom, left: p.paddingLeft, right: p.paddingRight };
}

/** The route's line as the map's source holds it: none until a route is chosen. */
const NO_LINE = { type: "FeatureCollection" as const, features: [] };

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
  const container = useRef<View>(null);
  const map = useRef<MapboxMap | null>(null);
  const view = useRef({ center: [...OPENING_CENTER] as LngLat, zoom: REST_ZOOM, touchedAt: 0 });
  const [size, setSize] = useState({ width: 393, height: 768 });
  const { fontScale } = useWindowDimensions();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [arc, setArc] = useState(1);
  // Where the camera stands, for which pins are on the near side and where each label fits; `frame` moves the views
  // laid over the map with every frame the camera moves.
  const [seen, setSeen] = useState<GlobeCamera>({ center: [...OPENING_CENTER] as LngLat, zoom: REST_ZOOM });
  const [, setFrame] = useState(0);
  const [pressGuard] = useState(() => createPressGuard());
  // The press handler reads what is drawn now, not what was drawn when the map was made.
  const latest = useRef<{ press: (e: mapboxgl.MapMouseEvent) => void }>({ press: () => {} });
  const callbacks = useRef({ onFailed, onReady });
  useEffect(() => {
    callbacks.current = { onFailed, onReady };
  });

  const moving = !paused && !reducedMotion;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => motion.remove();
  }, []);

  // The map, made once over the container's own element (react-native-web hands a View's ref its DOM node).
  useEffect(() => {
    const element = container.current as unknown as HTMLElement | null;
    const token = env.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (!element || !token) {
      callbacks.current.onFailed();
      return;
    }
    let styleLoaded = false;
    const m = new mapboxgl.Map({
      container: element,
      accessToken: token,
      style: SATELLITE_STYLE,
      projection: "globe",
      center: [...OPENING_CENTER] as LngLatLike,
      zoom: REST_ZOOM,
      minZoom: ZOOM_RANGE.min,
      maxZoom: ZOOM_RANGE.max,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      cooperativeGestures: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    m.on("style.load", () => {
      styleLoaded = true;
      m.setFog(FOG);
      // The black globe's floor (ADR-IMPL-068): a missing tile shows the drawn globe's deep ocean, not near-black.
      if (m.getLayer("background")) m.setPaintProperty("background", "background-color", tokens.colors.globeOceanDeep);
      m.addSource(ROUTE_SOURCE, { type: "geojson", data: NO_LINE, lineMetrics: true });
      m.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round" },
        paint: { "line-color": tokens.colors.textOnPhoto, "line-width": GLOBE_SPEC.routeStroke },
      });
    });
    m.on("load", () => {
      setMapReady(true);
      callbacks.current.onReady();
    });
    // Before the style is in, the map cannot draw: the drawn globe stays. After it, a failing tile is a blemish.
    m.on("error", () => {
      if (!styleLoaded) callbacks.current.onFailed();
    });
    const touch = () => {
      view.current.touchedAt = Date.now();
    };
    m.on("dragstart", touch);
    m.on("zoomstart", touch);
    m.on("mousedown", touch);
    m.on("touchstart", touch);
    m.on("move", () => {
      const c = m.getCenter();
      const zoom = m.getZoom();
      view.current.center = [c.lng, c.lat];
      view.current.zoom = zoom;
      setFrame((n) => n + 1);
      setSeen((s) =>
        Math.abs(c.lng - s.center[0]) > 0.5 || Math.abs(c.lat - s.center[1]) > 0.5 || Math.abs(zoom - s.zoom) > 0.03
          ? { center: [c.lng, c.lat], zoom }
          : s,
      );
    });
    m.on("click", (e) => latest.current.press(e));
    map.current = m;
    return () => {
      map.current = null;
      m.remove();
    };
  }, []);

  // The view's size: Mapbox draws into it, and the padding and the labels' band follow it.
  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
      map.current?.resize();
    }
  }

  // The slow turn, while nothing is chosen and nobody has touched the globe for 4 s; it eases back to the rest zoom
  // and latitude as it turns, as the phone's does.
  useEffect(() => {
    if (!mapReady || !moving || selected !== null) return;
    const t = setInterval(() => {
      const v = view.current;
      if (Date.now() - v.touchedAt < GLOBE_SPEC.idleResumeMs) return;
      const [lng, lat] = v.center;
      map.current?.easeTo({
        center: [lng - TURN_DEG_PER_S, lat + (OPENING_CENTER[1] - lat) * 0.2],
        zoom: v.zoom + (REST_ZOOM - v.zoom) * 0.2,
        duration: 1000,
        easing: (x) => x,
      });
    }, 1000);
    return () => clearInterval(t);
  }, [mapReady, moving, selected]);

  // A chosen destination flies the camera to frame the route over the sheet (13); none eases back to rest (02).
  const dest = pins.find((p) => p.code === selected) ?? null;
  const destLat = dest?.lat;
  const destLng = dest?.lng;
  const homeLat = home?.lat;
  const homeLng = home?.lng;
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    view.current.touchedAt = Date.now();
    m.setMinZoom(destLat === undefined ? REST_ZOOM : ZOOM_RANGE.min);
    if (destLat === undefined || destLng === undefined) {
      m.easeTo({
        center: [...OPENING_CENTER] as LngLatLike,
        zoom: REST_ZOOM,
        padding: padding(centreY, size.height),
        duration: reducedMotion ? 0 : MOVE_MS.frame,
      });
      return;
    }
    const from = homeLat === undefined || homeLng === undefined ? null : { lat: homeLat, lng: homeLng };
    const cam = routeCamera(from, { lat: destLat, lng: destLng });
    const target = {
      center: cam.center as LngLatLike,
      zoom: cam.zoom,
      // The arc rises above the camera's centre: the centre stands `lift` lower, so the arc lands mid-band (13).
      padding: padding(centreY + cam.lift, size.height),
    };
    if (reducedMotion) m.jumpTo(target);
    else m.flyTo({ ...target, duration: MOVE_MS.flight });
  }, [mapReady, destLat, destLng, homeLat, homeLng, centreY, size.height, reducedMotion]);

  // The route on the map, drawn home to destination in 600 ms once the flight has landed; whole under reduced motion.
  const line = dest && home ? routeLine(home, dest) : null;
  const middle = dest && home ? routeMiddle(home, dest) : null;
  useEffect(() => {
    const source = mapReady ? (map.current?.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined) : undefined;
    source?.setData(line ?? NO_LINE);
  }, [mapReady, line]);
  useEffect(() => {
    if (!mapReady || !map.current?.getLayer(ROUTE_LAYER)) return;
    // The undrawn part of the route is transparent: [drawn so far, end].
    map.current.setPaintProperty(ROUTE_LAYER, "line-trim-offset", [Math.min(arc, 0.9999), 1]);
  }, [mapReady, arc]);
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

  // Where Mapbox shows a place now, in the view's points.
  const project = (lng: number, lat: number) => {
    const p = map.current?.project([lng, lat]);
    return p ? { x: p.x, y: p.y } : null;
  };

  // The pins: every destination at rest (02), the route's two ends once one is chosen (13) — the near side only, each
  // where Mapbox shows it, with its label where it fits.
  const lift = dest && home ? routeCamera(home, dest).lift : 0;
  const centre = { x: size.width / 2, y: centreY + lift };
  const shown: (PinToPlace & { lng: number; lat: number; pin: Pin })[] = [];
  const ends: { code: string; x: number; y: number; end: RouteEndKind; testID: string }[] = [];
  if (dest) {
    const d = project(dest.lng, dest.lat);
    if (d) ends.push({ code: dest.code, ...d, end: "destination", testID: `globe.pin.${dest.code}` });
    const h = home?.code ? project(home.lng, home.lat) : null;
    if (h && home?.code) ends.push({ code: home.code, ...h, end: "origin", testID: "globe.home" });
  } else if (mapReady) {
    for (const p of pins) {
      if (!mapPoint(p, seen, centre)) continue; // past the horizon
      const at = project(p.lng, p.lat);
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
  const plane = middle && arc >= 1 ? project(middle.at[0], middle.at[1]) : null;

  // ADR-IMPL-068: a press on the disc at rest is the place under the finger (`mapboxPress`, as on the phone); the sky is
  // nothing. A pin takes its own press: it is a view over the map, so the map never sees it.
  const press = (e: mapboxgl.MapMouseEvent) => {
    view.current.touchedAt = Date.now();
    if (!onTapPlace) return;
    const cam: GlobeCamera = { center: [...view.current.center] as LngLat, zoom: view.current.zoom };
    const places = new Map(shown.map((s) => [s.code, { lng: s.lng, lat: s.lat }]));
    const targets = placed.flatMap((p) => {
      const at = places.get(p.code);
      return at ? [{ ...p, ...at }] : [];
    });
    const seenThen = { camera: cam, centre, viewHeight: size.height, placed: targets, route: selected !== null };
    const choice = mapboxPress(
      { lng: e.lngLat.lng, lat: e.lngLat.lat, screen: { x: e.point.x, y: e.point.y } },
      seenThen,
      pressGuard,
    );
    if (choice?.kind === "pin") {
      if (pressGuard.choose(choice.code)) onSelect(choice.code);
    } else if (choice?.kind === "place") {
      onTapPlace(choice.tap);
    }
  };
  useEffect(() => {
    latest.current.press = press;
  });

  // Mapbox's terms: logo and attribution always visible — just above the sheet.
  const ornament = Math.max(8, size.height - sheetTop + 8);
  useEffect(() => {
    const element = container.current as unknown as HTMLElement | null;
    for (const corner of ["bottom-left", "bottom-right"]) {
      const box = element?.querySelector<HTMLElement>(`.mapboxgl-ctrl-${corner}`);
      if (box) box.style.bottom = `${ornament}px`;
    }
  }, [ornament, mapReady]);

  return (
    // `globe.map`: the satellite globe's surface, which takes the pan, the pinch and the tap — as on the phone.
    <View testID="globe.map" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {/* Sized in points, not by the absolute fill: Mapbox's own stylesheet makes its container `position: relative`,
          which would leave it no height. */}
      <View ref={container} style={{ width: size.width, height: size.height }} />
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {plane && middle ? (
          <View
            style={[
              styles.plane,
              { left: plane.x - GLOBE_SPEC.plane / 2, top: plane.y - GLOBE_SPEC.plane / 2 },
              { transform: [{ rotate: `${middle.bearing}deg` }] },
            ]}
            pointerEvents="none"
          >
            <Icon name="plane-fill" size={18} color={tokens.colors.textOnPhoto} />
          </View>
        ) : null}
        {ends.map((e) => (
          <RouteEnd key={e.testID} testID={e.testID} x={e.x} y={e.y} code={e.code} end={e.end} />
        ))}
        {placed.map((p) => {
          const s = shown.find((x) => x.code === p.code);
          if (!s) return null;
          const pin = s.pin;
          const name = pin.city ?? pin.code;
          return (
            <GlobePin
              key={p.code}
              testID={`globe.pin.${pin.code}`}
              x={p.x}
              y={p.y}
              lines={p.lines}
              label={p.label?.box ?? null}
              accessibilityLabel={pin.fromPrice ? `${name}, from ${pin.fromPrice}` : name}
              onPress={
                pin.code !== selected
                  ? () => {
                      view.current.touchedAt = Date.now();
                      if (!onTapPlace || pressGuard.choose(pin.code)) onSelect(pin.code);
                    }
                  : undefined
              }
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plane: {
    position: "absolute",
    width: GLOBE_SPEC.plane,
    height: GLOBE_SPEC.plane,
    alignItems: "center",
    justifyContent: "center",
  },
});
