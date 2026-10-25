/**
 * Which globe Explore draws (ADR-IMPL-035, ADR-IMPL-055). Mapbox when the build can: not the e2e APK (Maestro taps the
 * drawn globe's pins, offline), a public token present, and the native module linked — @rnmapbox/maps throws on import
 * without it, so it is loaded only after that check. Anything else, or a Mapbox failure at render, draws GlobeFallback.
 *
 * Instant globe: the drawn globe shows at once; the satellite globe fades in over it once Mapbox has loaded, and the
 * drawn one leaves when the fade is done. Both stand where the screen asks — centred at rest under the greeting (02),
 * lifted over the sheet once a route is chosen (13).
 */
import { Component, type ReactNode, Suspense, lazy, useEffect, useState } from "react";
import { NativeModules, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { GLOBE_SPEC, GlobeFallback, routeView, tokens } from "@bbc/ui";

import { env } from "@/lib/env";

import { type TileProbe, satelliteTileProbe, shouldShowMapbox } from "./mapbox-ready-logic";
import type { MapboxGlobeProps } from "./MapboxGlobe";

export const MAPBOX_READY =
  env.EXPO_PUBLIC_APP_ENV !== "e2e" && env.EXPO_PUBLIC_MAPBOX_TOKEN !== undefined && NativeModules.RNMBXModule != null;

const MapboxGlobe = lazy(() => import("./MapboxGlobe"));

/** The satellite globe's fade over the drawn one, and the moment after it when the drawn one may go. */
const FADE_MS = tokens.motion.panel * 2;
const FRAME = GLOBE_SPEC.frame;

type Props = Omit<MapboxGlobeProps, "onFailed" | "onReady"> & {
  /** The screen's width: the drawn globe's frame is centred on it. */
  width: number;
};

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
  const { pins, home, selected, onSelect, onTapPlace, centreY, band, paused = false, width, ...mapProps } = props;
  // Mapbox reports a map that cannot load (bad token, style error) without throwing: switch to the drawn globe.
  const [mapFailed, setMapFailed] = useState(false);
  // Mapbox has loaded and drawn: fade it in over the drawn globe, then let the drawn one go.
  const [mapReady, setMapReady] = useState(false);
  // …and only once one tile of its satellite imagery has come back as an image (F107): a style without imagery draws
  // a black sphere, and Mapbox 10.3.7 on Android never says so.
  const [tileProbe, setTileProbe] = useState<TileProbe>("pending");
  const show = shouldShowMapbox({ styleLoaded: mapReady, tileProbe });
  const [drawnGone, setDrawnGone] = useState(false);
  const reducedMotion = useReducedMotion();
  const fade = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  // A chosen route arcs above the globe's centre (13): the globe stands that much lower, so the arc lands mid-band.
  const dest = pins.find((p) => p.code === selected) ?? null;
  const lift = dest && home ? routeView([home.lng, home.lat], [dest.lng, dest.lat]).lift : 0;
  const frameCentre = centreY + lift;
  // The drawn globe's frame follows the centre the screen asks for: up over a chosen route, down again at rest.
  const frameTop = useSharedValue(frameCentre - FRAME / 2);
  const frameStyle = useAnimatedStyle(() => ({ top: frameTop.value }));

  useEffect(() => {
    frameTop.value = withTiming(frameCentre - FRAME / 2, { duration: reducedMotion ? 0 : tokens.motion.panel * 2 });
  }, [frameCentre, reducedMotion, frameTop]);

  // One tile of the imagery, asked once per session; without it the drawn globe stays.
  useEffect(() => {
    if (!MAPBOX_READY) return;
    let cancelled = false;
    void satelliteTileProbe(env.EXPO_PUBLIC_MAPBOX_TOKEN).then((probe) => {
      if (cancelled) return;
      setTileProbe(probe);
      if (probe === "failed") {
        console.warn("Mapbox imagery did not load; drawing GlobeFallback instead.");
        setMapFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!show) return;
    const duration = reducedMotion ? 0 : FADE_MS;
    fade.set(withTiming(1, { duration }));
    const t = setTimeout(() => setDrawnGone(true), duration + 50);
    return () => clearTimeout(t);
  }, [show, reducedMotion, fade]);

  const left = (width - FRAME) / 2;
  const top = frameCentre - FRAME / 2;
  // The band the labels may use, in the frame's points: inside the screen's edges, under the greeting, over the sheet.
  const bounds = { left: -left + 8, top: band.top - top, right: -left + width - 8, bottom: band.bottom - top };
  const avoid = (band.avoid ?? []).map((r) => ({
    left: r.left - left,
    top: r.top - top,
    right: r.right - left,
    bottom: r.bottom - top,
  }));

  const drawnActive = !MAPBOX_READY || mapFailed || !drawnGone;
  const drawn = drawnActive ? (
    <Animated.View style={[styles.drawn, frameStyle]} pointerEvents="box-none">
      <GlobeFallback
        pins={pins}
        home={home}
        selected={selected}
        onSelect={onSelect}
        onTapPlace={onTapPlace}
        size={FRAME}
        bounds={bounds}
        avoid={avoid}
        paused={paused}
      />
    </Animated.View>
  ) : null;
  if (!MAPBOX_READY || mapFailed) return drawn;
  return (
    <>
      {drawn}
      <DrawnGlobeOnError onFail={() => setMapFailed(true)}>
        <Suspense fallback={null}>
          {/* Invisible until loaded, and untouchable: the drawn globe's pins take the taps meanwhile. */}
          <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents={show ? "auto" : "none"}>
            <MapboxGlobe
              {...mapProps}
              pins={pins}
              home={home}
              selected={selected}
              onSelect={onSelect}
              onTapPlace={onTapPlace}
              centreY={centreY}
              band={band}
              paused={paused}
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
  // The frame centred by layout, not by a measured width: it overflows the screen evenly on both sides.
  drawn: { position: "absolute", left: 0, right: 0, height: FRAME, alignItems: "center" },
});
