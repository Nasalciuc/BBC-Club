import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /** An icon before the words: the trip's chips (`Nov 12 – 19, 2026`, `Business`, `1 adult`; 04, 13). */
  icon?: IconName;
  /**
   * `trip` (default): light grey, navy words, an icon — the trip's chips (04, 13). `filter`: the status filters of
   * Requests (09) — light grey with slate words, navy with white words when chosen.
   */
  variant?: "trip" | "filter";
  /** `equal`: an even share of its row; `content`: it grows from its own width. */
  fill?: "equal" | "content";
  /** None: a fact, not a choice — drawn the same, not pressable. */
  onPress?: () => void;
  testID: string;
};

/**
 * 09's filters: 31.7 pt tall, the words 12.5 Medium 14 pt either side, at least 55.5 wide (`All`); chosen, navy with
 * 13.5 Semibold white words. 13's trip chips: 31 pt, a 16-pt icon 12 pt in, the words 9 pt after it, 14 pt to the
 * edge. Both light grey and fully round; the target reaches 44 pt by its hit slop.
 */
const FILTER = { height: 31.7, pad: 14, minWidth: 55.5 } as const;
const TRIP = { height: 31, padLeft: 12, icon: 16, gap: 9, padRight: 14 } as const;

export function Chip({
  label,
  selected = false,
  disabled = false,
  icon,
  variant = "trip",
  fill,
  onPress,
  testID,
}: Props) {
  const filter = variant === "filter";
  const color = selected ? tokens.colors.textOnPhoto : filter ? tokens.colors.textOnTint : tokens.colors.textPrimary;
  const content = (
    <>
      {icon ? <Icon name={icon} size={TRIP.icon} color={color} strokeWidth={1.6} /> : null}
      <Text
        style={[filter ? (selected ? styles.filterOn : styles.filterLabel) : styles.label, { color }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );
  const frame = [
    filter ? styles.filter : styles.trip,
    fill === "equal" && styles.equal,
    fill === "content" && styles.content,
    selected && styles.selected,
  ];
  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={label} style={frame}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={{ top: 7, bottom: 7 }}
      onPress={onPress}
      style={({ pressed }) => [...frame, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trip: {
    minHeight: TRIP.height,
    borderRadius: tokens.radius.pill,
    paddingLeft: TRIP.padLeft,
    paddingRight: TRIP.padRight,
    flexDirection: "row",
    alignItems: "center",
    gap: TRIP.gap,
    backgroundColor: tokens.colors.surfaceTint,
  },
  filter: {
    minHeight: FILTER.height,
    minWidth: FILTER.minWidth,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: FILTER.pad,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colors.surfaceTint,
  },
  equal: { flex: 1 },
  content: { flexGrow: 1 },
  selected: { backgroundColor: tokens.colors.primary },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  label: { ...rn(tokens.type.chipTrip) },
  filterLabel: { ...rn(tokens.type.chip) },
  filterOn: { ...rn(tokens.type.chipSelected) },
});
