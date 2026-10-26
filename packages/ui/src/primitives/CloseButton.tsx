import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Icon } from "../icons";
import { tokens } from "../tokens";

type Props = {
  onPress: () => void;
  testID: string;
  /** `plain`: the × alone (a sheet's header, 06). `tint`: the × in a light tint circle (20). */
  tone?: "plain" | "tint";
  /** The circle as the screen draws it (20: 30.8); 44 by default — the target stays 44 by its hit slop. */
  diameter?: number;
  /** The ×'s box and line as the screen draws them (20: 17.9 at 1.51); 24 at 1.75 by default. */
  glyph?: { size: number; stroke: number };
  /** Drawn but not to be pressed: 23 keeps the × while a request sends, with no way out until the answer. */
  disabled?: boolean;
  style?: ViewStyle;
};

const TARGET = 44;

/** A sheet's close (sheet 42): a 44-pt target, the × in navy. Never the word Close. */
export function CloseButton({
  onPress,
  testID,
  tone = "plain",
  diameter = TARGET,
  glyph,
  disabled = false,
  style,
}: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Close"
      accessibilityState={disabled ? { disabled } : undefined}
      disabled={disabled}
      hitSlop={8 + Math.max(0, (TARGET - diameter) / 2)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hit,
        { width: diameter, height: diameter, borderRadius: diameter / 2 },
        tone === "tint" && styles.tint,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Icon name="x" size={glyph?.size ?? 24} color={tokens.colors.textPrimary} strokeWidth={glyph?.stroke ?? 1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: "center", justifyContent: "center" },
  tint: { backgroundColor: tokens.colors.surfaceTint },
  pressed: { opacity: 0.7 },
});
