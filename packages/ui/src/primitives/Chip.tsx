import { Pressable, StyleSheet, Text } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /**
   * How the chip takes its row's width. `equal`: an even share (Round trip / One way, Figma 135:849). `content`: it
   * grows from its own width, so a row of chips spans the sheet (Explore's dates, cabin and travelers, 52:23). Alone in
   * a column a chip already spans it (the cabins on Profile, 238:4710).
   */
  fill?: "equal" | "content";
  /** `lg` is 56 pt — the cabins on Profile (238:4710). Otherwise 48 pt (26:8). */
  size?: "md" | "lg";
  onPress: () => void;
  testID: string;
};

/**
 * Figma Chip (26:8): one choice among a few — trip type, cabin, this search's preferences. 48 pt, the field's 12-pt
 * radius, the label alone; selected is the navy fill.
 */
export function Chip({ label, selected = false, disabled = false, fill, size = "md", onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        size === "lg" && styles.lg,
        fill === "equal" && styles.equal,
        fill === "content" && styles.content,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 48,
    borderRadius: tokens.radius.field,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  lg: { height: 56 },
  equal: { flex: 1 },
  // 52:23: Explore's chips are padded 12 all round and share the row's leftover width.
  content: { flexGrow: 1, paddingHorizontal: tokens.space.sm },
  selected: { backgroundColor: tokens.colors.actionPrimary, borderColor: tokens.colors.actionPrimary },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  label: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
  selectedLabel: { color: tokens.colors.textOnDark },
});
