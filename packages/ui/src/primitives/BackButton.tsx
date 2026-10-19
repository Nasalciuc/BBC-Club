import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Icon } from "../icons";
import { tokens } from "../tokens";

type Props = {
  onPress: () => void;
  testID: string;
  /**
   * `plain`: the chevron alone, in a top bar (07, 34, 36). `photo`: a round white button over a photograph (05, 11,
   * 13). `tint`: the round button on a white page (26).
   */
  variant?: "plain" | "photo" | "tint";
  style?: ViewStyle;
};

/** Back (component sheet 38, round photo buttons; sheet 42, top bar): a 44-pt target, the chevron. Never the word Back. */
export function BackButton({ onPress, testID, variant = "plain", style }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hit,
        variant === "photo" && styles.photo,
        variant === "tint" && styles.tint,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name="chevron-left"
        size={variant === "plain" ? 28 : 24}
        color={tokens.colors.textPrimary}
        strokeWidth={2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: tokens.radius.pill },
  photo: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.float },
  tint: { backgroundColor: tokens.colors.surfaceTint },
  pressed: { opacity: 0.75 },
});
