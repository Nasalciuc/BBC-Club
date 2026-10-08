import { Pressable, StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  action?: { label: string; onPress: () => void; testID: string };
  /** A second mono label at the right edge — the destination's local time on 536:10864 (`LONDON · 8:42 PM`). */
  trailing?: { label: string; testID: string } | null;
};

/** The 24-above / 12-below rhythm. Callers pass the label; the component uppercases. */
export function SectionLabel({ label, action, trailing }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label} accessibilityRole="header">
        {label.toUpperCase()}
      </Text>
      {trailing && !action ? (
        <Text testID={trailing.testID} style={styles.label} numberOfLines={1}>
          {trailing.label.toUpperCase()}
        </Text>
      ) : null}
      {action ? (
        <Pressable
          testID={action.testID}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
          onPress={action.onPress}
          style={({ pressed }) => (pressed ? styles.pressed : undefined)}
        >
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: tokens.space.lg,
    marginBottom: tokens.space.sm,
  },
  label: { ...rn(tokens.type.labelMono), color: tokens.colors.textSecondary },
  action: { ...rn(tokens.type.bodySm), color: tokens.colors.primary },
  pressed: { opacity: 0.6 },
});
