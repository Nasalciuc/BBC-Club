import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, rn, tokens } from "@bbc/ui";

import { greetingFor } from "./greeting";

type Props = {
  /** The member's first name; none — the greeting stands alone. */
  name: string | null;
  initials: string;
  onProfile: () => void;
  topInset: number;
};

/**
 * Explore's header (02, 16): `Good morning,` in slate over the member's first name, their portrait at the right — their
 * initials until the club keeps a photo (ADR-IMPL-055) — which opens Profile.
 */
export function GreetingHeader({ name, initials, onProfile, topInset }: Props) {
  const greeting = greetingFor(new Date().getHours());
  return (
    <View style={[styles.row, { paddingTop: topInset }]} pointerEvents="box-none" testID="explore.header">
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
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Avatar initials={initials} size={56} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: tokens.space.gutter,
    gap: tokens.space.md,
  },
  text: { flex: 1 },
  greeting: { ...rn(tokens.type.greeting), color: tokens.colors.textSecondary },
  name: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  pressed: { opacity: 0.85 },
});
