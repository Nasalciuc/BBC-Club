import { Pressable, StyleSheet, Text, View } from "react-native";
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
const greetingType = tokens.type.greeting;
const nameType = tokens.type.greetingName;

/**
 * Explore's header (02, 16): `Good morning,` in its slate over the member's first name, their portrait at the right —
 * their initials until the club keeps a photo (ADR-IMPL-055) — which opens Profile.
 */
export function GreetingHeader({ name, initials, portrait = null, onProfile, topInset }: Props) {
  const greeting = greetingFor(new Date().getHours());
  return (
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
  );
}

const styles = StyleSheet.create({
  header: { position: "absolute", left: 0, right: 0, height: HEAD.nameBaseline + 12 },
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
