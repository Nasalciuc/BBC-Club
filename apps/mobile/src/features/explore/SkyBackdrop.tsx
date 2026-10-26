import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { GLOBE_SPEC, tokens } from "@bbc/ui";

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
 * 02's clouds: soft white puffs around the globe and over its foot, where the search bar floats — in points from the
 * globe's centre at rest, scaled with its radius. They leave while a route is chosen (13 has none).
 */
const PUFFS: readonly (readonly [number, number, number])[] = [
  [-1.19, -0.42, 0.24],
  [-1.1, -0.18, 0.27],
  [-1.19, 0.18, 0.3],
  [-1.04, 0.45, 0.31],
  [-0.89, 0.71, 0.33],
  [-0.57, 0.89, 0.3],
  [1.16, -0.57, 0.21],
  [1.22, -0.3, 0.27],
  [1.13, 0.3, 0.29],
  [1.22, 0.54, 0.33],
  [0.98, 0.74, 0.35],
  [0.57, 0.92, 0.31],
  [-0.27, 0.98, 0.3],
  [0, 1.01, 0.36],
  [0.27, 0.98, 0.3],
];

/** The clouds' canvas, centred on the screen and wider than any phone: it overflows evenly on both sides. */
const CANVAS = 640;

export function SkyClouds({ centreY, shown }: { centreY: number; shown: boolean }) {
  const reducedMotion = useReducedMotion();
  const r = GLOBE_SPEC.radius;
  const top = centreY - r * 1.2;
  const height = r * 2.6;
  const fade = useAnimatedStyle(() => ({
    opacity: withTiming(shown ? 1 : 0, { duration: reducedMotion ? 0 : tokens.motion.panel }),
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.clouds, { top, height }, fade]}>
      <Svg width={CANVAS} height={height}>
        <Defs>
          <RadialGradient id="cloud" cx="50%" cy="50%" r="50%">
            <Stop offset={0} stopColor={tokens.colors.surfaceCard} stopOpacity={0.95} />
            <Stop offset={0.55} stopColor={tokens.colors.surfaceCard} stopOpacity={0.7} />
            <Stop offset={1} stopColor={tokens.colors.surfaceCard} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {PUFFS.map(([dx, dy, size], i) => (
          <Circle key={i} cx={CANVAS / 2 + dx * r} cy={r * 1.2 + dy * r} r={size * r} fill="url(#cloud)" />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clouds: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
