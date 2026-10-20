import { useEffect } from "react";
import { StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { tokens } from "../tokens";

type Props = {
  width?: DimensionValue;
  height: number;
  /** `sm` 12 for lines and blocks, `pill` for badges and dots, `lg` 20 for a card's photo. */
  radius?: "sm" | "md" | "lg" | "pill";
  style?: ViewStyle;
};

/**
 * A placeholder while a list loads (29; sheet 41, card and row skeletons): light tint that shimmers softly — opacity only,
 * so it never draws attention; still under reduced motion.
 */
export function Skeleton({ width = "100%", height, radius = "sm", style }: Props) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(
      withRepeat(
        withTiming(0.55, { duration: tokens.motion.shimmer / 2, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [pulse, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius: tokens.radius[radius] }, animated, style]}
    />
  );
}

/** A card of skeletons in the shape of a request card (29): the photo, three lines and the badge, a rule, two facts. */
export function CardSkeleton({ testID }: { testID?: string }) {
  return (
    <View style={styles.card} testID={testID}>
      <Skeleton width={128} height={128} radius="md" />
      <View style={styles.lines}>
        <View style={styles.top}>
          <Skeleton width="55%" height={18} radius="pill" />
          <Skeleton width={72} height={24} radius="pill" />
        </View>
        <Skeleton width="35%" height={14} radius="pill" />
        <Skeleton width="60%" height={14} radius="pill" />
        <View style={styles.rule} />
        <View style={styles.top}>
          <Skeleton width="40%" height={12} radius="pill" />
          <Skeleton width="30%" height={12} radius="pill" />
        </View>
      </View>
    </View>
  );
}

/** A row skeleton (sheet 41): a round photo and two lines. */
export function RowSkeleton() {
  return (
    <View style={[styles.card, styles.row]}>
      <Skeleton width={44} height={44} radius="pill" />
      <View style={styles.lines}>
        <Skeleton width="80%" height={14} radius="pill" />
        <Skeleton width="55%" height={12} radius="pill" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: tokens.colors.surfaceTint },
  card: {
    flexDirection: "row",
    gap: tokens.space.md,
    padding: tokens.space.xs,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  row: { alignItems: "center", padding: tokens.space.md },
  lines: { flex: 1, gap: tokens.space.sm, justifyContent: "center", paddingVertical: tokens.space.xs },
  top: { flexDirection: "row", justifyContent: "space-between", gap: tokens.space.sm },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: tokens.colors.borderDefault },
});
