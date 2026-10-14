import { Pressable, StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  action?: { label: string; onPress: () => void; testID: string };
  /** A second mono label at the right edge — the destination's local time on 536:10864 (`LONDON · 8:42 PM`). */
  trailing?: { label: string; testID: string } | null;
  /** No rhythm of its own: the parent spaces it (a request's detail, Figma 233:4173, sets 24 / 8 pt itself). */
  flush?: boolean;
  /**
   * Figma SectionLabel (26:40) as Explore's sheet draws it: a 32-pt box with the label centred in it and no margins of
   * its own — the parent's gaps space it (89:386–89:389, 536:10635). Its action is Figma's 80 × 48 text button
   * (`See all`, 97:433), its words centred, standing over the box without making it taller: the row itself grows to
   * the 48 and gives the 8 pt back above and below, so the whole target is inside its parent — a touch never reaches
   * a child outside its parent's bounds — and the box keeps its 32 in the rhythm.
   */
  box?: boolean;
};

/** The 24-above / 12-below rhythm, or Explore's 32-pt box. Callers pass the label; the component uppercases. */
export function SectionLabel({ label, action, trailing, flush = false, box = false }: Props) {
  return (
    <View style={[styles.row, flush && styles.flush, box && styles.box, box && action && styles.boxWithAction]}>
      <Text style={styles.label} accessibilityRole="header">
        {label.toUpperCase()}
      </Text>
      {trailing && !action ? (
        <Text testID={trailing.testID} style={styles.label}>
          {trailing.label.toUpperCase()}
        </Text>
      ) : null}
      {action ? (
        <Pressable
          testID={action.testID}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={box ? undefined : 8}
          onPress={action.onPress}
          style={({ pressed }) => [box && styles.boxAction, pressed && styles.pressed]}
        >
          <Text style={box ? styles.boxActionLabel : styles.action}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // When the label and its right-hand side do not fit on one line (a narrow phone, a long city, a large font scale),
  // the right-hand side wraps under the label: nothing is cut (DESIGN.md).
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "baseline",
    columnGap: tokens.space.sm,
    rowGap: tokens.space.xxs,
    marginTop: tokens.space.lg,
    marginBottom: tokens.space.sm,
  },
  flush: { marginTop: 0, marginBottom: 0 },
  // The row wraps (above), so its line is centred in the box by `alignContent`, its words in the line by `alignItems`.
  box: { minHeight: 32, alignItems: "center", alignContent: "center", marginTop: 0, marginBottom: 0 },
  label: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary, flexShrink: 1 },
  action: { ...rn(tokens.type.bodySm), color: tokens.colors.primary },
  // The row is the target's parent: 48 pt tall, 8 of them given back above and below, so its place in the rhythm
  // stays the 32-pt box while the 80 × 48 action lies wholly inside it.
  boxWithAction: { minHeight: 48, marginVertical: -tokens.space.xs },
  boxAction: {
    width: 80,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  boxActionLabel: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
  pressed: { opacity: 0.6 },
});
