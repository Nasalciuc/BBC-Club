import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  label: string;
  /** The chosen value (`Nov 12, 2026`, `1 adult`); null shows `placeholder` in slate. */
  value: string | null;
  placeholder?: string;
  icon: IconName;
  onPress: () => void;
  error?: boolean;
  disabled?: boolean;
  testID: string;
};

/**
 * A field that opens a picker (sheet 39, date and travelers fields; 06): the icon, a rule, the label over the value, the
 * chevron down. Error: a red border and a red label (22).
 */
export function PickerField({
  label,
  value,
  placeholder,
  icon,
  onPress,
  error = false,
  disabled = false,
  testID,
}: Props) {
  const tone = error ? tokens.colors.statusDanger : tokens.colors.textPrimary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : `${label}, ${placeholder ?? "not chosen"}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.field,
        disabled && styles.disabled,
        error && styles.error,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.iconCol}>
        <Icon name={icon} size={20} color={tone} strokeWidth={1.5} />
      </View>
      <View style={styles.rule} />
      <View style={styles.text}>
        <Text style={[styles.label, error && styles.labelError]} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[styles.value, (value === null || disabled) && styles.placeholder]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {value ?? placeholder ?? " "}
        </Text>
      </View>
      <Icon name="chevron-down" size={16} color={tone} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Two to a row (06: Depart and Return): tight enough beside the icon and the chevron for `Nov 12, 2026`.
  field: {
    flex: 1,
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xs,
    paddingHorizontal: tokens.space.xs,
    paddingVertical: tokens.space.xs,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  disabled: { backgroundColor: tokens.colors.surfaceTint },
  error: { borderColor: tokens.colors.statusDanger, borderWidth: 1.5, paddingHorizontal: tokens.space.xs - 0.5 },
  pressed: { backgroundColor: tokens.colors.surfaceTint },
  iconCol: { width: 22, alignItems: "center" },
  rule: {
    width: StyleSheet.hairlineWidth * 2,
    alignSelf: "stretch",
    backgroundColor: tokens.colors.borderDefault,
    marginVertical: -tokens.space.xs,
  },
  text: { flex: 1, gap: 2 },
  label: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  labelError: { color: tokens.colors.statusDangerText },
  value: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  placeholder: { color: tokens.colors.textSecondary },
});
