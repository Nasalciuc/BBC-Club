import { geoCircle } from "d3-geo";
import type { MultiPolygon, Polygon } from "geojson";
import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, ClipPath, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";

import { Icon } from "../icons";
import { tokens } from "../tokens";
import { createGlobeEngine, type Route } from "./globe-engine";
import { GLOBE_SPEC, greatCircle, planeOnRoute, projector, radiusFor } from "./globe-logic";
import { GlobePin } from "./GlobePin";
import { type PinToPlace, type Rect, labelScale, pinPriority, placeLabels } from "./pin-labels";

/**
 * A destination on the globe. `fromPrice` is the formatted starting fare (`$3,900`), empty for a destination chosen
 * from search without one; `price` its amount, which orders the labels.
 */
export type Pin = {
  code: string;
  city?: string;
  lat: number;
  lng: number;
  hasOffer: boolean;
  fromPrice: string;
  price?: number;
};

type Props = {
  pins: Pin[];
  /** The member's home airport: drawn, with its code, only at a chosen route's start (13). */
  home: { lat: number; lng: number; code?: string } | null;
  selected: string | null;
  onSelect: (code: string) => void;
  size?: number;
  /** The part of the frame on screen, in the frame's points: labels stay inside it. */
  bounds?: Rect;
  /** What the labels must not cover, in the frame's points (13: the back button). */
  avoid?: readonly Rect[];
  /** Its screen is not in view or the sheet covers it: drawn as it was, nothing runs. */
  paused?: boolean;
};

/** e2e builds hold still: Maestro taps globe.pin.LHR, and parity compares the stills. */
const HOLD_STILL = process.env.EXPO_PUBLIC_APP_ENV === "e2e";

const circle = (lng: number, lat: number, radius: number) =>
  geoCircle().center([lng, lat]).radius(radius).precision(3)().coordinates;

/** The drawn globe's deserts (the Sahara, Arabia, Iran, the Gobi, Australia, the Kalahari), each a soft patch of sand
 *  that fades into the land around it, painted inside the land only. */
const DESERTS: Polygon[] = [
  circle(-8, 21, 8),
  circle(4, 23, 10),
  circle(18, 23, 10),
  circle(30, 24, 7),
  circle(46, 22, 7.5),
  circle(60, 31, 5),
  circle(84, 39, 5),
  circle(104, 42, 6.5),
  circle(130, -25, 10),
  circle(140, -26, 6),
  circle(21, -23, 6),
].map((coordinates) => ({ type: "Polygon", coordinates }));
/** Ice: Greenland softly, the Arctic and Antarctica, inside the land only. */
const GREENLAND: Polygon = { type: "Polygon", coordinates: circle(-41, 73, 11) };
const POLES: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [circle(0, 90, 20), circle(0, -90, 26)],
};

/**
 * The Explore globe drawn in vector (ADR-IMPL-055): the Earth by day — ocean, land, deserts and ice in the `globe-*`
 * colours — on the pale sky, a light rim of atmosphere, the destinations as navy drop pins with their labels (02), and
 * a chosen route as a white line with its plane, framed across the top of the screen (13). Natural Earth land. All
 * mutable state lives in the engine (globe-engine.ts); this component reads only props and state, so React Compiler can
 * compile it and nothing depends on manual memoization. Mapbox's satellite globe replaces it where the build has it.
 */
export function GlobeFallback({
  pins,
  home,
  selected,
  onSelect,
  size = GLOBE_SPEC.frame,
  bounds,
  avoid = [],
  paused = false,
}: Props) {
  const sel = pins.find((p) => p.code === selected) ?? null;
  const route: Route | null = sel ? { from: home ? [home.lng, home.lat] : null, to: [sel.lng, sel.lat] } : null;
  const { fontScale } = useWindowDimensions();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  // One engine per mount: it builds the gesture once, so a re-render never hands GestureDetector a new gesture mid-drag.
  const [engine] = useState(() =>
    createGlobeEngine({ size, selected, route, reducedMotion: false, holdStill: HOLD_STILL }),
  );
  const [frame, setFrame] = useState(() => engine.initialFrame);

  useEffect(() => engine.attach({ frame: setFrame }), [engine]);
  const fromLng = route?.from?.[0];
  const fromLat = route?.from?.[1];
  const toLng = route?.to[0];
  const toLat = route?.to[1];
  useEffect(() => {
    const next =
      toLng === undefined || toLat === undefined
        ? null
        : {
            from: fromLng === undefined || fromLat === undefined ? null : ([fromLng, fromLat] as const),
            to: [toLng, toLat] as const,
          };
    engine.update({ size, selected, route: next, reducedMotion });
  }, [engine, size, selected, fromLng, fromLat, toLng, toLat, reducedMotion]);
  useEffect(() => (appActive && !paused ? engine.run() : undefined), [engine, appActive, paused]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    const app = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => {
      motion.remove();
      app.remove();
    };
  }, []);

  // Render: props and state only. Projecting a handful of pins, the route and the small desert and ice shapes is cheap;
  // the land path is already in `frame`.
  const proj = projector(size, frame.rotation, frame.zoom);
  const c = size / 2;
  const r = radiusFor(size, frame.zoom);
  const routePath = route?.from ? proj.path(greatCircle(route.from, route.to)) : "";
  const plane = route?.from ? planeOnRoute(proj, route.from, route.to) : null;

  // At rest every destination, each with its city and price (02); once a route is chosen, its two ends with their codes (13).
  const shown: (PinToPlace & { pin: Pin | null })[] = [];
  if (sel) {
    const at = proj.point([sel.lng, sel.lat]);
    if (at) {
      shown.push({ code: sel.code, x: at[0], y: at[1], lines: [sel.code], priority: 0, pin: sel });
    }
    const homeAt = home ? proj.point([home.lng, home.lat]) : null;
    if (home && homeAt) {
      shown.push({
        code: "home",
        x: homeAt[0],
        y: homeAt[1],
        lines: home.code ? [home.code] : [],
        priority: 1,
        pin: null,
      });
    }
  } else {
    for (const p of pins) {
      const at = proj.point([p.lng, p.lat]);
      if (!at) continue; // the far hemisphere
      const lines = [p.city ?? p.code, p.fromPrice].filter((l) => l.length > 0);
      const priority = pinPriority({ selected: false, home: false, hasOffer: p.hasOffer, price: p.price ?? 0 });
      shown.push({ code: p.code, x: at[0], y: at[1], lines, priority, pin: p });
    }
  }
  const placed = placeLabels(
    shown,
    bounds ?? { left: 0, top: 0, right: size, bottom: size },
    avoid,
    labelScale(fontScale),
  );

  return (
    <GestureDetector gesture={engine.gesture}>
      <View style={[styles.wrap, { width: size, height: size }]} collapsable={false}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient
              id="globe-ocean"
              cx={c - r * 0.3}
              cy={c - r * 0.35}
              r={r * 1.45}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset={0} stopColor={tokens.colors.globeOcean} />
              <Stop offset={1} stopColor={tokens.colors.globeOceanDeep} />
            </RadialGradient>
            <RadialGradient
              id="globe-light"
              cx={c - r * 0.35}
              cy={c - r * 0.4}
              r={r * 1.1}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset={0} stopColor={tokens.colors.surfaceCard} stopOpacity={0.16} />
              <Stop offset={0.6} stopColor={tokens.colors.surfaceCard} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="globe-limb" cx={c} cy={c} r={r} gradientUnits="userSpaceOnUse">
              <Stop offset={0.8} stopColor={tokens.colors.sky} stopOpacity={0} />
              <Stop offset={1} stopColor={tokens.colors.sky} stopOpacity={0.6} />
            </RadialGradient>
            <RadialGradient id="globe-air" cx={c} cy={c} r={r * 1.07} gradientUnits="userSpaceOnUse">
              <Stop offset={0.9} stopColor={tokens.colors.surfaceCard} stopOpacity={0.85} />
              <Stop offset={1} stopColor={tokens.colors.surfaceCard} stopOpacity={0} />
            </RadialGradient>
            {/* Each patch's own box (objectBoundingBox): the sand and the snow fade out toward their edges. */}
            <RadialGradient id="globe-sand">
              <Stop offset={0} stopColor={tokens.colors.globeDesert} stopOpacity={0.85} />
              <Stop offset={0.5} stopColor={tokens.colors.globeDesert} stopOpacity={0.6} />
              <Stop offset={1} stopColor={tokens.colors.globeDesert} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="globe-snow">
              <Stop offset={0} stopColor={tokens.colors.globeIce} stopOpacity={1} />
              <Stop offset={0.7} stopColor={tokens.colors.globeIce} stopOpacity={0.9} />
              <Stop offset={1} stopColor={tokens.colors.globeIce} stopOpacity={0} />
            </RadialGradient>
            <ClipPath id="globe-land">
              <Path d={frame.land} />
            </ClipPath>
          </Defs>
          <Circle cx={c} cy={c} r={r * 1.07} fill="url(#globe-air)" />
          <Path d={proj.sphere()} fill="url(#globe-ocean)" />
          <Path d={frame.land} fill={tokens.colors.globeLand} />
          <G clipPath="url(#globe-land)">
            {DESERTS.map((desert, i) => (
              <Path key={i} d={proj.path(desert)} fill="url(#globe-sand)" />
            ))}
            <Path d={proj.path(GREENLAND)} fill="url(#globe-snow)" />
            <Path d={proj.path(POLES)} fill={tokens.colors.globeIce} />
          </G>
          <Path d={proj.sphere()} fill="url(#globe-light)" />
          <Path d={proj.sphere()} fill="url(#globe-limb)" />
          {routePath ? (
            <Path
              d={routePath}
              fill="none"
              stroke={tokens.colors.textOnPhoto}
              strokeWidth={GLOBE_SPEC.routeStroke}
              strokeLinecap="round"
            />
          ) : null}
        </Svg>
        {plane ? (
          <View
            pointerEvents="none"
            style={[
              styles.plane,
              {
                left: plane.at[0] - GLOBE_SPEC.plane / 2,
                top: plane.at[1] - GLOBE_SPEC.plane / 2,
                transform: [{ rotate: `${plane.angle + 90}deg` }],
              },
            ]}
          >
            <Icon name="plane-fill" size={18} color={tokens.colors.textOnPhoto} />
          </View>
        ) : null}
        {placed.map((p) => {
          const pin = shown.find((s) => s.code === p.code)?.pin ?? null;
          const name = pin?.city ?? pin?.code ?? home?.code ?? "Home";
          return (
            <GlobePin
              key={p.code}
              testID={pin ? `globe.pin.${pin.code}` : "globe.home"}
              x={p.x}
              y={p.y}
              lines={p.lines}
              label={p.label?.box ?? null}
              accessibilityLabel={pin ? (pin.fromPrice ? `${name}, from ${pin.fromPrice}` : name) : `Home, ${name}`}
              onPress={pin && pin.code !== selected ? () => onSelect(pin.code) : undefined}
            />
          );
        })}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center" },
  plane: { position: "absolute", width: GLOBE_SPEC.plane, height: GLOBE_SPEC.plane },
});
