import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons";
import { tokens } from "../tokens";

type Props = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
  /** `photo`: white with the float shadow, over a photograph (sheet 38). `glass`: the translucent button over a
   *  photograph (11, 12's settings). `tint`: light tint, on a white page. */
  tone?: "photo" | "glass" | "tint";
  /** The circle as the screen draws it (11, 12: 35); 44 by default — the target stays 44 by its hit slop. */
  diameter?: number;
  iconSize?: number;
  strokeWidth?: number;
  /** A toggle's state (a saved fare's heart): read out, and the icon filled. */
  selected?: boolean;
  style?: ViewStyle;
};

/** The round buttons of sheet 38 — share, heart, bookmark, close, settings: a 44-pt circle, the 22-pt icon in navy. */
export function RoundButton({
  icon,
  accessibilityLabel,
  onPress,
  testID,
  tone = "photo",
  selected,
  diameter = 44,
  iconSize = 22,
  strokeWidth = 1.75,
  style,
}: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={6 + Math.max(0, (44 - diameter) / 2)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.circle,
        { width: diameter, height: diameter, borderRadius: diameter / 2 },
        tone === "photo" ? styles.photo : tone === "glass" ? styles.glass : styles.tint,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={iconSize} color={tokens.colors.textPrimary} strokeWidth={strokeWidth} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  photo: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.float },
  glass: { backgroundColor: tokens.colors.photoButton },
  tint: { backgroundColor: tokens.colors.surfaceTint },
  pressed: { opacity: 0.75 },
});
