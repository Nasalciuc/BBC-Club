import { Pressable, StyleSheet, Text } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /** An icon before the words: the trip's chips (`Nov 12 – 19, 2026`, `Business`, `1 adult`, sheet 39). */
  icon?: IconName;
  /**
   * `trip` (default): light tint, navy words, an icon — the trip's chips. `filter`: the status filters of Requests —
   * light tint with slate words, navy when selected (sheet 39).
   */
  variant?: "trip" | "filter";
  /** `equal`: an even share of its row; `content`: it grows from its own width. */
  fill?: "equal" | "content";
  /** 1.0 prop, kept while its screens move to 3.0: `lg` was 56 pt. */
  size?: "md" | "lg";
  onPress: () => void;
  testID: string;
};

/** A pill that chooses or edits (sheet 39): 40 pt, `pill`, light tint; selected is navy with white words. */
export function Chip({
  label,
  selected = false,
  disabled = false,
  icon,
  variant = "trip",
  fill,
  size = "md",
  onPress,
  testID,
}: Props) {
  const filter = variant === "filter";
  const color = selected ? tokens.colors.textOnPhoto : filter ? tokens.colors.textOnTint : tokens.colors.textPrimary;
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
        filter && styles.filter,
        fill === "equal" && styles.equal,
        fill === "content" && styles.content,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {icon ? <Icon name={icon} size={20} color={color} strokeWidth={1.75} /> : null}
      <Text
        style={[filter ? styles.filterLabel : styles.label, { color }, selected && filter && styles.selectedLabel]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.xs,
    backgroundColor: tokens.colors.surfaceTint,
  },
  lg: { minHeight: 52 },
  filter: { minHeight: 40, paddingHorizontal: tokens.space.lg },
  equal: { flex: 1 },
  content: { flexGrow: 1 },
  selected: { backgroundColor: tokens.colors.actionPrimary },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  label: { ...rn(tokens.type.body) },
  filterLabel: { ...rn(tokens.type.body) },
  selectedLabel: { ...rn(tokens.type.bodyStrong) },
});
