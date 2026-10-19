import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons";
import { tokens } from "../tokens";

type Props = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
  /** `photo`: white with the float shadow, over a photograph (sheet 38). `tint`: light tint, on a white page. */
  tone?: "photo" | "tint";
  /** A toggle's state (a saved fare's heart): read out, and the icon filled. */
  selected?: boolean;
  style?: ViewStyle;
};

/** The round buttons of sheet 38 — share, heart, bookmark, close, settings: a 44-pt circle, the 22-pt icon in navy. */
export function RoundButton({ icon, accessibilityLabel, onPress, testID, tone = "photo", selected, style }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.circle,
        tone === "photo" ? styles.photo : styles.tint,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={22} color={tokens.colors.textPrimary} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { width: 44, height: 44, borderRadius: tokens.radius.pill, alignItems: "center", justifyContent: "center" },
  photo: { backgroundColor: tokens.colors.surfaceCard, ...tokens.elevation.float },
  tint: { backgroundColor: tokens.colors.surfaceTint },
  pressed: { opacity: 0.75 },
});
