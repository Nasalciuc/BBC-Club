import { Pressable, StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** Formatted amount, e.g. `$2,055`. Round trip only (ADR-IMPL-037). */
  amount: string;
  onPress: () => void;
  testID: string;
};

/** Figma copy (07 · Additions, 536:10635). One source: the row, its accessibility label and the tests read it. */
export const ESTIMATE_COPY = {
  title: (amount: string) => `From ${amount} · round trip`,
  facts: "ESTIMATE · NO PUBLISHED FARE YET",
  caption: "Indicative · your specialist confirms the fare",
  mark: "≈",
} as const;

/**
 * The indicative price on a route without a published fare — FareRow's shape with `≈` where the carrier mark sits and
 * nothing in the price slot: an estimate is not a fare (no carrier, no validity, not bookable). The whole row asks
 * for a quote. Figma 536:10635 (A1 · Home · Lisbon selected).
 */
export function EstimateRow({ amount, onPress, testID }: Props) {
  const title = ESTIMATE_COPY.title(amount);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${ESTIMATE_COPY.caption}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.mark}>
        <Text style={styles.markText}>{ESTIMATE_COPY.mark}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.facts} numberOfLines={1}>
          {ESTIMATE_COPY.facts}
        </Text>
        <Text style={styles.caption} numberOfLines={2}>
          {ESTIMATE_COPY.caption}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    marginBottom: tokens.space.md,
  },
  pressed: { opacity: 0.9 },
  mark: {
    width: 20,
    height: 20,
    borderRadius: tokens.radius.badge,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { ...rn(tokens.type.labelMono), color: tokens.colors.textPrimary },
  body: { flex: 1, gap: tokens.space.xxs },
  // The price pair wraps before it shrinks (DESIGN.md): the title may take two lines at large font scales.
  title: { ...rn(tokens.type.titleSm), color: tokens.colors.textPrimary },
  facts: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
});
