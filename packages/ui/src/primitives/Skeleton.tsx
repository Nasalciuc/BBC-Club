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

/**
 * A request card while the list loads (29), measured from the card's top and left: 140.2 tall, radius 12, the card
 * shadow; the photo's block 133.6 × 129.1 at (9.6, 5), the only one that shimmers; the city's bar 106.5 × 18 at
 * (156.3, 15.8); the badge's pill 74.6 × 23.5, 10.4 from the right; the route's bar 59.9 × 14.7 at 43.9, the days'
 * 113.8 × 15.2 at 68.3; the rule at 96.2 to 11.5 from the right; the facts' marks Ø18 at 108.9 and their bars 47.9 ×
 * 11.5 at 112.1, the second 100.9 after the first.
 */
export function CardSkeleton({ testID }: { testID?: string }) {
  return (
    <View style={styles.requestCard} testID={testID}>
      <Skeleton width={133.6} height={129.1} style={styles.cardPhoto} />
      <View style={[styles.bar, { left: TEXT, top: 15.8, width: 106.5, height: 18 }]} />
      <View style={[styles.bar, styles.round, { right: 10.4, top: 15.8, width: 74.6, height: 23.5 }]} />
      <View style={[styles.bar, { left: TEXT, top: 43.9, width: 59.9, height: 14.7 }]} />
      <View style={[styles.bar, { left: TEXT, top: 68.3, width: 113.8, height: 15.2 }]} />
      <View style={styles.cardRule} />
      <View style={[styles.bar, styles.round, { left: TEXT, top: 108.9, width: 18, height: 18 }]} />
      <View style={[styles.bar, styles.round, { left: TEXT + 24, top: 112.1, width: 47.9, height: 11.5 }]} />
      <View style={[styles.bar, styles.round, { left: TEXT + 100.9, top: 108.6, width: 18.2, height: 18.2 }]} />
      <View style={[styles.bar, styles.round, { left: TEXT + 124.9, top: 112.1, width: 47.9, height: 11.5 }]} />
    </View>
  );
}

const TEXT = 156.3;

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
  block: { backgroundColor: tokens.colors.skeleton },
  requestCard: {
    height: 140.2,
    borderRadius: 12,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.card,
  },
  cardPhoto: { position: "absolute", left: 9.6, top: 5, borderRadius: 8 },
  bar: { position: "absolute", borderRadius: 5, backgroundColor: tokens.colors.skeleton },
  round: { borderRadius: tokens.radius.pill },
  cardRule: {
    position: "absolute",
    left: TEXT + 0.3,
    right: 11.5,
    top: 96.2,
    height: 0.7,
    backgroundColor: tokens.colors.borderFaint,
  },
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
