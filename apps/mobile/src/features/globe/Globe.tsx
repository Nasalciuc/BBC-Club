/**
 * Which globe Explore draws (ADR-IMPL-035). Mapbox when the build can: not the e2e APK (Maestro taps the drawn
 * globe's pins, offline), a public token present, and the native module linked — @rnmapbox/maps throws on import
 * without it, so it is loaded only after that check. Anything else, or a Mapbox failure at render, draws GlobeFallback.
 */
import { Component, type ReactNode, Suspense, lazy, useState } from "react";
import { NativeModules, StyleSheet, View } from "react-native";

import { GlobeFallback, type Pin } from "@bbc/ui";

import { env } from "@/lib/env";

import type { MapboxGlobeProps } from "./MapboxGlobe";

export const MAPBOX_READY =
  env.EXPO_PUBLIC_APP_ENV !== "e2e" && env.EXPO_PUBLIC_MAPBOX_TOKEN !== undefined && NativeModules.RNMBXModule != null;

const MapboxGlobe = lazy(() => import("./MapboxGlobe"));

/** Figma: the drawn globe's frame top — Rest (89:386) y 92, a selected route (89:387) y 8. */
const FALLBACK_TOP = { rest: 92, selected: 8 } as const;

type Props = Omit<MapboxGlobeProps, "onFailed"> & { pins: Pin[] };

class DrawnGlobeOnError extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn("Mapbox globe failed; drawing GlobeFallback instead.", error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Globe(props: Props) {
  const { pins, home, selected, onSelect, state, hidden } = props;
  // Mapbox reports a map that cannot load (bad token, style error) without throwing: switch to the drawn globe.
  const [mapFailed, setMapFailed] = useState(false);
  // The drawn globe animates on the JS thread: unmount it while the sheet covers it, as before.
  const drawn = hidden ? null : (
    <View style={[styles.drawn, { top: FALLBACK_TOP[state] }]} pointerEvents="box-none">
      <GlobeFallback pins={pins} home={home} selected={selected} onSelect={onSelect} />
    </View>
  );
  if (!MAPBOX_READY || mapFailed) return drawn;
  return (
    <DrawnGlobeOnError fallback={drawn}>
      <Suspense fallback={null}>
        <MapboxGlobe
          {...props}
          onFailed={() => {
            console.warn("Mapbox map failed to load; drawing GlobeFallback instead.");
            setMapFailed(true);
          }}
        />
      </Suspense>
    </DrawnGlobeOnError>
  );
}

const styles = StyleSheet.create({
  drawn: { position: "absolute", left: 0, right: 0, height: 520, alignItems: "center" },
});
