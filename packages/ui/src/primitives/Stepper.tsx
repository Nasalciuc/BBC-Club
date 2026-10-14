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
  disabled?: boolean;
  testID: string;
};

/**
 * Figma Stepper (47:46): a white card, 80 pt — the label, then minus, the count and plus. Each button is a 48-pt square
 * with the field's radius; at a bound it dims to 40%. Bounds are caller-owned (Passengers schema).
 */
export function Stepper({ label, value, onChange, min = 0, max = 9, disabled = false, testID }: Props) {
  const atMin = disabled || value <= min;
  const atMax = disabled || value >= max;

  return (
    <View style={styles.row} testID={testID}>
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      <View style={styles.controls}>
        <Pressable
          testID={`${testID}.minus`}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          onPress={() => onChange(Math.max(min, value - 1))}
          style={({ pressed }) => [styles.btn, atMin && styles.btnDisabled, pressed && !atMin && styles.pressed]}
        >
          <Icon name="minus" size={20} color={tokens.colors.textPrimary} />
        </Pressable>
        <Text style={[styles.value, disabled && styles.labelDisabled]} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <Pressable
          testID={`${testID}.plus`}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={({ pressed }) => [styles.btn, atMax && styles.btnDisabled, pressed && !atMax && styles.pressed]}
        >
          <Icon name="plus" size={20} color={tokens.colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    padding: tokens.space.md,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary, flex: 1 },
  labelDisabled: { color: tokens.colors.textTertiary },
  controls: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  btn: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.field,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfacePage,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  value: { ...rn(tokens.type.body), color: tokens.colors.textPrimary, width: 24, textAlign: "center" },
});
