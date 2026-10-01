import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, StyleSheet, View } from "react-native";
import { GestureDetector, Pressable } from "react-native-gesture-handler";
import Svg, { Path } from "react-native-svg";
import { tokens } from "../tokens";
import { createGlobeEngine } from "./globe-engine";
import { GLOBE_SPEC, haloOpacity, projector, routeArcPath } from "./globe-logic";

export type Pin = { code: string; lat: number; lng: number; hasOffer: boolean; fromPrice: string };

type Props = {
  pins: Pin[];
  home: { lat: number; lng: number } | null;
  selected: string | null;
  onSelect: (code: string) => void;
  size?: number;
};

/** e2e builds hold the opening position: Maestro taps globe.pin.LHR, and parity compares the reduced-motion stills. */
const HOLD_STILL = process.env.EXPO_PUBLIC_APP_ENV === "e2e";

/**
 * The Explore globe — orthographic, Natural Earth land, measured from Figma: 97:435 (London selected), 482:1115 (Globe ·
 * Map style) and page 06 · Motion. All mutable state lives in the engine (globe-engine.ts); this component reads only
 * props and state, so React Compiler can compile it and nothing depends on manual memoization.
 * The name stays GlobeFallback until #48 merges, so this PR shares no file with it; the rename to Globe follows then.
 */
export function GlobeFallback({ pins, home, selected, onSelect, size = 520 }: Props) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  // One engine per mount: it builds the gesture once, so a re-render never hands GestureDetector a new gesture mid-drag.
  const [engine] = useState(() => createGlobeEngine({ size, selected, reducedMotion: false, holdStill: HOLD_STILL }));
  const [frame, setFrame] = useState(() => engine.initialFrame);
  const [clock, setClock] = useState(0); // drives the halo pulse

  useEffect(() => engine.attach({ frame: setFrame, clock: setClock }), [engine]);
  useEffect(() => {
    engine.update({ size, selected, reducedMotion });
  }, [engine, size, selected, reducedMotion]);
  useEffect(() => (appActive ? engine.run() : undefined), [engine, appActive]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    const app = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => {
      motion.remove();
      app.remove();
    };
  }, []);

  // Render: props and state only. Projecting a handful of pins and one arc is cheap; the land path is already in `frame`.
  const proj = projector(size, frame.rotation, frame.zoom);
  const halo = haloOpacity(clock, HOLD_STILL || reducedMotion);
  const sel = pins.find((p) => p.code === selected) ?? null;
  const from = home ? proj.point([home.lng, home.lat]) : null;
  const to = sel ? proj.point([sel.lng, sel.lat]) : null;
  const arc = from && to ? routeArcPath(from, to, [size / 2, size / 2]) : "";

  return (
    <GestureDetector gesture={engine.gesture}>
      <View style={[styles.wrap, { width: size, height: size }]} collapsable={false}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path
            d={proj.sphere()}
            fill={tokens.colors.surfacePanel}
            stroke={tokens.colors.textOnDarkMuted}
            strokeOpacity={GLOBE_SPEC.rimOpacity}
            strokeWidth={1}
          />
          <Path d={frame.land} fill={tokens.colors.surfaceMuted} />
          {arc ? (
            <Path
              d={arc}
              fill="none"
              stroke={tokens.colors.textOnDark}
              strokeWidth={GLOBE_SPEC.arcStroke}
              strokeDasharray={[...GLOBE_SPEC.arcDash]}
            />
          ) : null}
        </Svg>
        {pins.map((pin) => {
          const xy = proj.point([pin.lng, pin.lat]);
          if (!xy) return null; // Figma: pins disappear on the far hemisphere
          const isSel = pin.code === selected;
          const big = isSel || pin.hasOffer;
          const dot = big ? GLOBE_SPEC.pin.offerDot : GLOBE_SPEC.pin.dot;
          const colour = isSel
            ? tokens.colors.accentWarm
            : pin.hasOffer
              ? tokens.colors.textOnDark
              : tokens.colors.textOnDarkMuted;
          const hit = GLOBE_SPEC.pin.hit;
          return (
            <Pressable
              key={pin.code}
              testID={`globe.pin.${pin.code}`}
              accessibilityRole="button"
              accessibilityLabel={`${pin.code}, ${pin.fromPrice}`}
              onPress={() => onSelect(pin.code)}
              style={[styles.hit, { left: xy[0] - hit / 2, top: xy[1] - hit / 2, width: hit, height: hit }]}
            >
              {big ? (
                <View
                  style={[
                    styles.round,
                    { width: GLOBE_SPEC.pin.halo, height: GLOBE_SPEC.pin.halo, backgroundColor: colour, opacity: halo },
                  ]}
                />
              ) : null}
              <View style={[styles.round, { width: dot, height: dot, backgroundColor: colour }]} />
            </Pressable>
          );
        })}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center" },
  hit: { position: "absolute", alignItems: "center", justifyContent: "center" },
  round: { position: "absolute", borderRadius: 999 },
});
