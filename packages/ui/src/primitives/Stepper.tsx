import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Under the label in slate (`Ages 18+`). */
  caption?: string;
  /** Before the label (`user` on onboarding's Adults, 01). */
  icon?: IconName;
  /** False: the control alone, without its card (inside a card that already holds rows). */
  card?: boolean;
  testID: string;
};

/**
 * Who travels (01, sheet 39): a white card on a hairline — the icon, the label over its caption, and the pill stepper
 * `− 1 +` in light tint at the right. At a bound a button dims to 40%. Bounds are the caller's (Passengers schema).
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9,
  disabled = false,
  caption,
  icon,
  card = true,
  testID,
}: Props) {
  const atMin = disabled || value <= min;
  const atMax = disabled || value >= max;
  return (
    <View style={[styles.row, card && styles.card]} testID={testID}>
      {icon ? <Icon name={icon} size={28} color={tokens.colors.textPrimary} strokeWidth={1.5} /> : null}
      <View style={styles.text}>
        <Text style={[styles.label, disabled && styles.dim]}>{label}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      <View style={styles.pill}>
        <Pressable
          testID={`${testID}.minus`}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          hitSlop={4}
          onPress={() => onChange(Math.max(min, value - 1))}
          style={({ pressed }) => [styles.btn, atMin && styles.dim, pressed && !atMin && styles.pressed]}
        >
          <Icon name="minus" size={20} color={tokens.colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.value, disabled && styles.dim]} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <Pressable
          testID={`${testID}.plus`}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          hitSlop={4}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={({ pressed }) => [styles.btn, atMax && styles.dim, pressed && !atMax && styles.pressed]}
        >
          <Icon name="plus" size={20} color={tokens.colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, minHeight: 56 },
  card: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
    minHeight: 72,
  },
  text: { flex: 1, gap: 2 },
  label: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary },
  caption: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceTint,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    overflow: "hidden",
  },
  btn: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
  value: {
    ...rn(tokens.type.subtitle),
    color: tokens.colors.textPrimary,
    minWidth: 40,
    height: 40,
    lineHeight: 40,
    textAlign: "center",
    backgroundColor: tokens.colors.surfaceCard,
  },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
});
