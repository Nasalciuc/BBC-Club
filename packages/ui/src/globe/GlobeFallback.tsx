import { geoCircle } from "d3-geo";
import type { MultiPolygon, Polygon } from "geojson";
import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, ClipPath, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";

import { Icon } from "../icons";
import { tokens } from "../tokens";
import { createGlobeEngine, type Route } from "./globe-engine";
import {
  GLOBE_SPEC,
  type GlobeTap,
  type View as GlobeView,
  createPressGuard,
  greatCircle,
  planeOnRoute,
  projector,
  radiusFor,
} from "./globe-logic";
import { GlobePin, RouteEnd } from "./GlobePin";
import { type PinToPlace, type Rect, labelScale, pinAt, pinPriority, placeLabels } from "./pin-labels";

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
  /**
   * A tap on the globe that is no pin's (ADR-IMPL-068): the place under the finger. A tap on the sky, beside the disc,
   * is nothing; a tap on a pin, its label or its 44-pt target is the pin's. Without it the globe has no tap at all: its
   * pan and pinch, and the pins' own presses, as before.
   */
  onTapPlace?: (tap: GlobeTap) => void;
};

/** e2e builds hold still: Maestro taps globe.pin.LHR, and parity compares the stills. */
const HOLD_STILL = process.env.EXPO_PUBLIC_APP_ENV === "e2e";

/**
 * The pins drawn at rest (02) in one view — each with its city and price, its label where it fits — or none once a
 * route is chosen (13: its two ends are drawn apart, and are no target). Render draws them; a tap asks which one it
 * fell on, in the view that was on screen.
 */
function pinsInView(
  pins: readonly Pin[],
  proj: ReturnType<typeof projector>,
  frame: { bounds: Rect; avoid: readonly Rect[]; scale: number },
) {
  const shown: (PinToPlace & { pin: Pin })[] = [];
  for (const p of pins) {
    const at = proj.point([p.lng, p.lat]);
    if (!at) continue; // the far hemisphere
    const lines = [p.city ?? p.code, p.fromPrice].filter((l) => l.length > 0);
    const priority = pinPriority({ selected: false, home: false, hasOffer: p.hasOffer, price: p.price ?? 0 });
    shown.push({ code: p.code, x: at[0], y: at[1], lines, priority, pin: p });
  }
  return { shown, placed: placeLabels(shown, frame.bounds, frame.avoid, frame.scale) };
}

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
  onTapPlace,
}: Props) {
  const sel = pins.find((p) => p.code === selected) ?? null;
  const route: Route | null = sel ? { from: home ? [home.lng, home.lat] : null, to: [sel.lng, sel.lat] } : null;
  const { fontScale } = useWindowDimensions();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  // ADR-IMPL-068: the globe takes a tap of its own only when a tap off the pins has somewhere to go.
  const tap = onTapPlace !== undefined;
  // One engine per mount: it builds its gestures once, so a re-render never hands GestureDetector a new gesture
  // mid-drag — only a tap gaining or losing somewhere to go swaps one for the other.
  const [engine] = useState(() =>
    createGlobeEngine({ size, selected, route, reducedMotion: false, holdStill: HOLD_STILL, tap }),
  );
  const [frame, setFrame] = useState(() => engine.initialFrame);
  // One choice per touch: a pin's press and the globe's tap may both answer it, in either order.
  const [pressGuard] = useState(() => createPressGuard());

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
    engine.update({ size, selected, route: next, reducedMotion, tap });
  }, [engine, size, selected, fromLng, fromLat, toLng, toLat, reducedMotion, tap]);
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

  // At rest every destination, each with its city and price (02); once a route is chosen, its two ends with their codes
  // (13), drawn apart below.
  const labels = {
    bounds: bounds ?? { left: 0, top: 0, right: size, bottom: size },
    avoid,
    scale: labelScale(fontScale),
  };
  const ends: { code: string; x: number; y: number; end: "origin" | "destination"; testID: string }[] = [];
  const { shown, placed } = sel ? { shown: [], placed: [] } : pinsInView(pins, proj, labels);
  if (sel) {
    const at = proj.point([sel.lng, sel.lat]);
    if (at) ends.push({ code: sel.code, x: at[0], y: at[1], end: "destination", testID: `globe.pin.${sel.code}` });
    const homeAt = home ? proj.point([home.lng, home.lat]) : null;
    if (home && homeAt && home.code) {
      ends.push({ code: home.code, x: homeAt[0], y: homeAt[1], end: "origin", testID: "globe.home" });
    }
  }

  // With the globe's tap, a pin's press and the tap may both answer one touch: the guard keeps it to one choice.
  function choosePin(code: string) {
    if (code !== selected && (!tap || pressGuard.choose(code))) onSelect(code);
  }

  // ADR-IMPL-068: a tap, in the view that was on screen. On a pin it is the pin's — chosen here too, for the tap may
  // cancel the pin's own press (the guard keeps it to one choice); on the sky it is nothing; elsewhere on the disc it
  // is the place under the finger. A chosen route's view takes no tap: its ends are no targets.
  function onTap(x: number, y: number, view: GlobeView) {
    if (sel) return;
    const seen = projector(size, view.rotation, view.zoom);
    const hit = pinAt(x, y, pinsInView(pins, seen, labels).placed);
    if (hit) {
      choosePin(hit);
      return;
    }
    if (!onTapPlace || pressGuard.pressedLately()) return;
    const at = seen.invert(x, y);
    if (!at) return;
    onTapPlace({
      lng: at[0],
      lat: at[1],
      x,
      y,
      project: (p) => {
        const xy = seen.point([p.lng, p.lat]);
        return xy ? { x: xy[0], y: xy[1] } : null;
      },
    });
  }
  useEffect(() => engine.onTap(onTap), [engine, onTap]);

  return (
    <GestureDetector gesture={engine.gesture(tap)}>
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
            {/* Only the patches that show: one on the far side has an empty box, and the gradient sized to it would get
                a radius of 0, which crashes Android. */}
            {DESERTS.map((desert, i) =>
              proj.shows(desert) ? <Path key={i} d={proj.path(desert)} fill="url(#globe-sand)" /> : null,
            )}
            {proj.shows(GREENLAND) ? <Path d={proj.path(GREENLAND)} fill="url(#globe-snow)" /> : null}
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
        {ends.map((e) => (
          <RouteEnd key={e.testID} testID={e.testID} x={e.x} y={e.y} code={e.code} end={e.end} />
        ))}
        {placed.map((p) => {
          const pin: Pin | null = shown.find((s) => s.code === p.code)?.pin ?? null;
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
              onPress={pin && pin.code !== selected ? () => choosePin(pin.code) : undefined}
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
