import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons";
import { tokens } from "../tokens";

type Props = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
  /** `photo`: white with the float shadow, over a photograph (sheet 38). `glass`: the translucent button over a
   *  photograph (11, 12's settings). `tint`: light tint, on a white page. `neutral`: the near-white grey of 07's
   *  profile button, no shadow. */
  tone?: "photo" | "glass" | "tint" | "neutral";
  /** The circle as the screen draws it (11, 12: 35); 44 by default — the target stays 44 by its hit slop. */
  diameter?: number;
  iconSize?: number;
  strokeWidth?: number;
  /** A toggle's state (a saved fare's heart, a saved destination's bookmark): read out, and `selectedIcon` drawn. */
  selected?: boolean;
  /** The icon while `selected` (`bookmark-fill`); the same icon otherwise. */
  selectedIcon?: IconName;
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
  selectedIcon,
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
        tone === "photo"
          ? styles.photo
          : tone === "glass"
            ? styles.glass
            : tone === "neutral"
              ? styles.neutral
              : styles.tint,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name={selected && selectedIcon ? selectedIcon : icon}
        size={iconSize}
        color={tokens.colors.textPrimary}
        strokeWidth={strokeWidth}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  photo: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.float },
  glass: { backgroundColor: tokens.colors.photoButton },
  tint: { backgroundColor: tokens.colors.surfaceTint },
  neutral: { backgroundColor: tokens.colors.surfaceNeutral },
  pressed: { opacity: 0.75 },
});
