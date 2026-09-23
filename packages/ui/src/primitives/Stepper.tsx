import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  testID: string;
};

/** Adult / child / infant count control. Bounds are caller-owned (Passengers schema). */
export function Stepper({ label, value, onChange, min = 0, max = 9, testID }: Props) {
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controls}>
        <Pressable
          testID={`${testID}.minus`}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          hitSlop={8}
          onPress={() => onChange(Math.max(min, value - 1))}
          style={({ pressed }) => [styles.btn, atMin && styles.btnDisabled, pressed && !atMin && styles.pressed]}
        >
          <Icon name="minus" size={18} color={atMin ? tokens.colors.textTertiary : tokens.colors.textPrimary} />
        </Pressable>
        <Text style={styles.value} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <Pressable
          testID={`${testID}.plus`}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          hitSlop={8}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={({ pressed }) => [styles.btn, atMax && styles.btnDisabled, pressed && !atMax && styles.pressed]}
        >
          <Icon name="plus" size={18} color={atMax ? tokens.colors.textTertiary : tokens.colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.sm,
    paddingVertical: tokens.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary, flex: 1 },
  controls: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  btn: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  value: {
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    minWidth: 24,
    textAlign: "center",
  },
});
