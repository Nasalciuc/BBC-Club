import { LinearGradient } from "expo-linear-gradient";
import { Image, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";
import { GLOBE_SPEC, tokens } from "@bbc/ui";

import skyClouds from "@/assets/images/club/globe/sky-clouds.webp";

/** 02: the pale sky behind the globe, fading into the page under the search bar. */
export function SkyBackdrop() {
  return (
    <LinearGradient
      colors={[tokens.colors.sky, tokens.colors.sky, tokens.colors.surfacePage]}
      locations={[0, 0.3, 0.62]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

/**
 * 02's clouds (ADR-IMPL-085): the design's own cumulus around the globe and in front of its foot, where the search bar
 * floats — lifted off 02 by `scripts/sky-clouds-from-design.py` and laid where 02 lays them, by the globe: the picture's
 * globe (centre and radius in its pixels) on the screen's globe at rest. They leave while a route is chosen (13 has none).
 */
const PICTURE = { width: 852, height: 619, globe: { x: 438, y: 372.3, radius: 357.1 } } as const;

export function SkyClouds({ centreY, shown }: { centreY: number; shown: boolean }) {
  const reducedMotion = useReducedMotion();
  const k = GLOBE_SPEC.radius / PICTURE.globe.radius;
  const fade = useAnimatedStyle(() => ({
    opacity: withTiming(shown ? 1 : 0, { duration: reducedMotion ? 0 : tokens.motion.panel }),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.clouds, { top: centreY - PICTURE.globe.y * k, height: PICTURE.height * k }, fade]}
    >
      <Image
        source={skyClouds}
        accessible={false}
        style={{
          width: PICTURE.width * k,
          height: PICTURE.height * k,
          // The picture's globe on the screen's centre line, as the screen's globe stands.
          transform: [{ translateX: (PICTURE.width / 2 - PICTURE.globe.x) * k }],
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clouds: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
