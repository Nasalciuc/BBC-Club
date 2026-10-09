/**
 * Which globe Explore draws (ADR-IMPL-035). Mapbox when the build can: not the e2e APK (Maestro taps the drawn
 * globe's pins, offline), a public token present, and the native module linked — @rnmapbox/maps throws on import
 * without it, so it is loaded only after that check. Anything else, or a Mapbox failure at render, draws GlobeFallback.
 *
 * Instant globe (Figma 07 · Additions, A6): the drawn globe shows at once; the satellite globe fades in over it once
 * Mapbox has loaded, and the drawn one leaves when the fade is done. No empty space while imagery downloads.
 */
import { Component, type ReactNode, Suspense, lazy, useEffect, useState } from "react";
import { NativeModules, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { GlobeFallback, type Pin, tokens } from "@bbc/ui";

import { env } from "@/lib/env";

import type { MapboxGlobeProps } from "./MapboxGlobe";

export const MAPBOX_READY =
  env.EXPO_PUBLIC_APP_ENV !== "e2e" && env.EXPO_PUBLIC_MAPBOX_TOKEN !== undefined && NativeModules.RNMBXModule != null;

const MapboxGlobe = lazy(() => import("./MapboxGlobe"));

/** Figma: the drawn globe's frame top — Rest (89:386) y 92, a selected route (89:387) y 8. */
const FALLBACK_TOP = { rest: 92, selected: 8 } as const;

/** The satellite globe's fade over the drawn one, and the moment after it when the drawn one may go. */
const FADE_MS = tokens.motion.panel * 2;

type Props = Omit<MapboxGlobeProps, "onFailed" | "onReady"> & { pins: Pin[] };

class DrawnGlobeOnError extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn("Mapbox globe failed; drawing GlobeFallback instead.", error);
    this.props.onFail();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Globe(props: Props) {
  const { pins, home, selected, onSelect, state, hidden } = props;
  // Mapbox reports a map that cannot load (bad token, style error) without throwing: switch to the drawn globe.
  const [mapFailed, setMapFailed] = useState(false);
  // Mapbox has loaded and drawn: fade it in over the drawn globe, then let the drawn one go.
  const [mapReady, setMapReady] = useState(false);
  const [drawnGone, setDrawnGone] = useState(false);
  const reducedMotion = useReducedMotion();
  const fade = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  useEffect(() => {
    if (!mapReady) return;
    const duration = reducedMotion ? 0 : FADE_MS;
    fade.value = withTiming(1, { duration });
    const t = setTimeout(() => setDrawnGone(true), duration + 50);
    return () => clearTimeout(t);
  }, [mapReady, reducedMotion, fade]);

  const drawnActive = !MAPBOX_READY || mapFailed || !drawnGone;
  // The drawn globe animates on the JS thread: unmount it while the sheet covers it, as before.
  const drawn =
    hidden || !drawnActive ? null : (
      <View style={[styles.drawn, { top: FALLBACK_TOP[state] }]} pointerEvents="box-none">
        <GlobeFallback pins={pins} home={home} selected={selected} onSelect={onSelect} />
      </View>
    );
  if (!MAPBOX_READY || mapFailed) return drawn;
  return (
    <>
      {drawn}
      <DrawnGlobeOnError onFail={() => setMapFailed(true)}>
        <Suspense fallback={null}>
          {/* Invisible until loaded, and untouchable: the drawn globe's pins take the taps meanwhile. On the light page
              (typing, expanded, an empty route) the map stays mounted — Mapbox keeps its tiles and camera — but is not
              displayed: Figma 89:388–89:391 have no globe there. */}
          <Animated.View
            style={[StyleSheet.absoluteFill, fadeStyle, hidden ? styles.hidden : null]}
            pointerEvents={mapReady && !hidden ? "auto" : "none"}
          >
            <MapboxGlobe
              {...props}
              onReady={() => setMapReady(true)}
              onFailed={() => {
                console.warn("Mapbox map failed to load; drawing GlobeFallback instead.");
                setMapFailed(true);
              }}
            />
          </Animated.View>
        </Suspense>
      </DrawnGlobeOnError>
    </>
  );
}

const styles = StyleSheet.create({
  drawn: { position: "absolute", left: 0, right: 0, height: 520, alignItems: "center" },
  hidden: { display: "none" },
});
