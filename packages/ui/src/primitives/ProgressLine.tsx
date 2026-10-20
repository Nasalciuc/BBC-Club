import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { tokens } from "../tokens";

type Props = {
  /** 0..1: how much of the step the member has answered; the navy fills toward it. */
  fraction: number;
};

/** Onboarding's progress (01): a 4-pt navy line on a light navy track, round at both ends; it fills as answers come. */
export function ProgressLine({ fraction }: Props) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(clamped);
  useEffect(() => {
    fill.set(withTiming(clamped, { duration: reduceMotion ? 0 : tokens.motion.fill }));
  }, [clamped, fill, reduceMotion]);
  const style = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View style={[styles.fill, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    width: "100%",
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: tokens.radius.pill, backgroundColor: tokens.colors.actionPrimary },
});
