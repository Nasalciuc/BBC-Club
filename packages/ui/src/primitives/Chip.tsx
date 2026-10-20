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
  /** `equal`: an even share of its row; `content`: it grows from its own width. None: it hugs its words. */
  fill?: "equal" | "content";
  /**
   * A trip chip as the screen draws it: `route` on the globe's sheet (13) — 31.3 pt, the 16-pt icon 12.5 in, the words
   * 8.1 after it and 13.2 from the edge; `place` on a destination's page (04) — 30 pt, 10.3 in, 7.1, 11.7, the words in
   * Medium. 13's measure without one.
   */
  look?: "route" | "place" | "fare";
  /** None: a fact, not a choice — drawn the same, not pressable. */
  onPress?: () => void;
  testID: string;
};

/**
 * 09's filters: 31.7 pt tall, the words 12.3 Medium 14 pt either side, at least 55.5 wide (`All`); chosen, navy with
 * 12.5 Semibold white words. 13's trip chips: 31 pt, a 16-pt icon 12 pt in, the words 9 pt after it, 14 pt to the
 * edge. Both light grey and fully round; the target reaches 44 pt by its hit slop.
 */
const FILTER = { height: 31.7, pad: 14, minWidth: 55.5 } as const;
const TRIP = { height: 31, padLeft: 12, icon: 16, gap: 9, padRight: 14 } as const;
const LOOKS = {
  route: { height: 31.3, padLeft: 12.5, icon: 16, gap: 8.1, padRight: 13.2, stroke: 1.9, text: tokens.type.routeChip },
  place: { height: 30, padLeft: 10.3, icon: 16, gap: 7.1, padRight: 11.7, stroke: 1.9, text: tokens.type.placeChip },
  // 05: the fare's facts, 26.8 pt, 9.3 in, the words 7.15 after the icon's 16-pt box and 12.6 from the edge; the seat
  // drawn smaller in its box (13.4 tall).
  fare: {
    height: 26.8,
    padLeft: 9.3,
    icon: 16,
    gap: 7.15,
    padRight: 12.6,
    stroke: 1.75,
    text: tokens.type.fareChip,
    sizes: { seat: 13.65 },
  },
} as const;

/**
 * How far a chip that acts reaches above and below it: 44 pt and more for each look that acts (the fare's facts do
 * not). A touch lands only inside the chip's parent, and a row that scrolls clips at its edges, so such a row leaves
 * this room in its padding.
 */
export const CHIP_SLOP = 7;

/** A glyph drawn smaller than its look's box, centred in that box (05's seat). */
function glyphSize(look: (typeof LOOKS)[keyof typeof LOOKS] | null, icon: IconName): number | undefined {
  if (!look || !("sizes" in look)) return undefined;
  return (look.sizes as Partial<Record<IconName, number>>)[icon];
}

export function Chip({
  label,
  selected = false,
  disabled = false,
  icon,
  variant = "trip",
  fill,
  look,
  onPress,
  testID,
}: Props) {
  const filter = variant === "filter";
  const drawn = !filter && look ? LOOKS[look] : null;
  const color = selected ? tokens.colors.textOnPhoto : filter ? tokens.colors.textOnTint : tokens.colors.textPrimary;
  const content = (
    <>
      {icon ? (
        <View style={[styles.iconBox, { width: drawn?.icon ?? TRIP.icon }]}>
          <Icon
            name={icon}
            size={glyphSize(drawn, icon) ?? drawn?.icon ?? TRIP.icon}
            color={color}
            strokeWidth={drawn?.stroke ?? 1.6}
          />
        </View>
      ) : null}
      <Text
        style={[
          filter ? (selected ? styles.filterOn : styles.filterLabel) : drawn ? rn(drawn.text) : styles.label,
          { color },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );
  const frame = [
    filter ? styles.filter : styles.trip,
    drawn && {
      minHeight: drawn.height,
      paddingLeft: drawn.padLeft,
      paddingRight: drawn.padRight,
      gap: drawn.gap,
    },
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
      hitSlop={{ top: CHIP_SLOP, bottom: CHIP_SLOP }}
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
  iconBox: { alignItems: "center" },
  equal: { flex: 1 },
  content: { flexGrow: 1 },
  selected: { backgroundColor: tokens.colors.primary },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  label: { ...rn(tokens.type.chipTrip) },
  filterLabel: { ...rn(tokens.type.chip) },
  filterOn: { ...rn(tokens.type.chipSelected) },
});
