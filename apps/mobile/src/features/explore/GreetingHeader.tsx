import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";
import { Avatar, type PhotoSource, baselineOffset, rn, tokens } from "@bbc/ui";

import { greetingFor } from "./greeting";

type Props = {
  /** The member's first name; none — the greeting stands alone. */
  name: string | null;
  initials: string;
  /** The member's photo (`ProfileVM.avatarUrl`); null — their initials. */
  portrait?: PhotoSource | null;
  onProfile: () => void;
  topInset: number;
  /**
   * The globe is pinched in and has risen under the header: the words stand on a veil of 02's sky, from the screen's
   * top to `veilFoot` (Mapbox's logo stands just under it and must stay visible).
   */
  veiled?: boolean;
  veilFoot?: number;
};

/**
 * 02 (and 16), measured on a 47-pt status bar, in points under the safe area: `Good morning,` from 23.3 with its
 * baseline at 23.9, the name from 24.6 at 58; the portrait 54.8 across in a 1-pt white ring, 18.8 from the right and
 * its top 0.85 above the safe area.
 */
const HEAD = {
  greetingLeft: 23.3,
  greetingBaseline: 23.9,
  nameLeft: 24.6,
  nameBaseline: 58,
  avatar: 54.8,
  avatarRight: 18.8,
  avatarTop: -0.85,
} as const;
/** The portrait's foot under the safe area: what stands under the header (Mapbox's logo at rest) starts below it. */
export const PORTRAIT_FOOT = HEAD.avatarTop + HEAD.avatar;
/** The veil's soft foot. */
const VEIL_SOFT = tokens.space.sm;
const greetingType = tokens.type.greeting;
const nameType = tokens.type.greetingName;

/**
 * Explore's header (02, 16): `Good morning,` in its slate over the member's first name, their portrait at the right —
 * their initials until the club keeps a photo (ADR-IMPL-055) — which opens Profile.
 */
export function GreetingHeader({
  name,
  initials,
  portrait = null,
  onProfile,
  topInset,
  veiled = false,
  veilFoot = topInset + HEAD.nameBaseline + tokens.space.sm,
}: Props) {
  const greeting = greetingFor(new Date().getHours());
  const reducedMotion = useReducedMotion();
  const veil = useAnimatedStyle(() => ({
    opacity: withTiming(veiled ? 1 : 0, { duration: reducedMotion ? 0 : tokens.motion.fade }),
  }));
  return (
    <>
      {/* Opaque sky to `sm` above its foot, then soft: the slate greeting keeps its 4.5:1 over any imagery. */}
      <Animated.View
        style={[styles.veil, { height: veilFoot }, veil]}
        pointerEvents="none"
        testID="explore.header.veil"
      >
        <LinearGradient
          colors={[tokens.colors.sky, tokens.colors.sky, `${tokens.colors.sky}00`]}
          locations={[0, Math.max(0, (veilFoot - VEIL_SOFT) / veilFoot), 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={[styles.header, { top: topInset }]} pointerEvents="box-none" testID="explore.header">
        <View style={styles.text} accessible accessibilityRole="header">
          <Text style={styles.greeting} numberOfLines={1}>
            {name ? `${greeting},` : greeting}
          </Text>
          {name ? (
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
          ) : null}
        </View>
        <Pressable
          testID="explore.profile"
          accessibilityRole="button"
          accessibilityLabel="Profile"
          hitSlop={4}
          onPress={onProfile}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          <Avatar initials={initials} photo={portrait} size={HEAD.avatar} />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  veil: { position: "absolute", left: 0, right: 0, top: 0 },
  header: { position: "absolute", left: 0, right: 0, height: HEAD.nameBaseline + tokens.space.sm },
  text: { position: "absolute", left: 0, right: HEAD.avatarRight + HEAD.avatar + tokens.space.xs, top: 0, bottom: 0 },
  greeting: {
    ...rn(greetingType),
    color: tokens.colors.textGreeting,
    position: "absolute",
    left: HEAD.greetingLeft,
    right: 0,
    top: HEAD.greetingBaseline - baselineOffset(greetingType),
  },
  name: {
    ...rn(nameType),
    color: tokens.colors.textPrimary,
    position: "absolute",
    left: HEAD.nameLeft,
    right: 0,
    top: HEAD.nameBaseline - baselineOffset(nameType),
  },
  avatar: { position: "absolute", right: HEAD.avatarRight, top: HEAD.avatarTop },
  pressed: { opacity: 0.85 },
});
