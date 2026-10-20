import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";
import { type FieldLook, PICKER_REQUEST } from "./field-looks";

type Props = {
  label: string;
  /** The chosen value (`Nov 12, 2026`, `1 adult`); null shows `placeholder` in slate. */
  value: string | null;
  placeholder?: string;
  icon: IconName;
  onPress: () => void;
  error?: boolean;
  disabled?: boolean;
  /** `request`: the request sheet's (06, 22, 23), as measured. Without one, sheet 39's. */
  look?: "request";
  testID: string;
};

/**
 * A field that opens a picker (sheet 39, date and travelers fields; 06): the icon, a rule, the label over the value, the
 * chevron down. Error: a red border, the icon, the label and the chevron red (22). While the request sends, the light
 * tint and slate words (23).
 */
export function PickerField({
  label,
  value,
  placeholder,
  icon,
  onPress,
  error = false,
  disabled = false,
  look,
  testID,
}: Props) {
  // 23: while the request sends, the icon and the chevron in a muted slate.
  const tone = error
    ? tokens.colors.statusDanger
    : disabled && look
      ? tokens.colors.fillMuted
      : tokens.colors.textPrimary;
  const spoken = value ? `${label}, ${value}` : `${label}, ${placeholder ?? "not chosen"}`;
  if (look === "request") {
    return (
      <DrawnPicker
        l={PICKER_REQUEST}
        label={label}
        value={value}
        placeholder={placeholder}
        icon={icon}
        tone={tone}
        error={error}
        disabled={disabled}
        spoken={spoken}
        onPress={onPress}
        testID={testID}
      />
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={spoken}
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

/** The measured picker (06): every part placed from the field's corner, the words on their baselines. */
function DrawnPicker({
  l,
  label,
  value,
  placeholder,
  icon,
  tone,
  error,
  disabled,
  spoken,
  onPress,
  testID,
}: {
  l: FieldLook;
  label: string;
  value: string | null;
  placeholder?: string;
  icon: IconName;
  tone: string;
  error: boolean;
  disabled: boolean;
  spoken: string;
  onPress: () => void;
  testID: string;
}) {
  const labelTop = l.label.baseline - baselineOffset(l.label.role);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        drawn.field,
        { minHeight: l.height, borderRadius: l.radius },
        disabled && drawn.disabled,
        pressed && !disabled && drawn.pressed,
      ]}
    >
      <View
        style={[
          drawn.icon,
          { left: l.icon.centre - l.icon.size / 2, top: l.height / 2 - l.icon.rise - l.icon.size / 2 },
        ]}
        importantForAccessibility="no-hide-descendants"
      >
        <Icon name={icon} size={l.icon.size} color={tone} strokeWidth={l.icon.stroke} />
      </View>
      <View style={[drawn.rule, { left: l.rule.left, top: l.rule.top, bottom: l.rule.bottom }]} />
      <View style={{ marginLeft: l.label.left, marginRight: l.chevron.right + l.chevron.size / 2 + 6 }}>
        <Text
          style={[
            l.label.role,
            { color: error ? tokens.colors.statusDangerText : disabled ? tokens.colors.chevronLight : l.label.color },
            { marginTop: labelTop },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={[
            l.value.role,
            {
              color: disabled
                ? tokens.colors.fillMuted
                : value === null
                  ? tokens.colors.textSecondary
                  : tokens.colors.textPrimary,
            },
            {
              marginTop:
                l.value.baseline - l.label.baseline - belowBaseline(l.label.role) - baselineOffset(l.value.role),
            },
          ]}
          numberOfLines={1}
        >
          {value ?? placeholder ?? " "}
        </Text>
      </View>
      <View
        style={[
          drawn.icon,
          { right: l.chevron.right - l.chevron.size / 2, top: l.height / 2 + l.chevron.drop - l.chevron.size / 2 },
        ]}
        importantForAccessibility="no-hide-descendants"
      >
        <Icon name="chevron-down" size={l.chevron.size} color={tone} strokeWidth={l.chevron.stroke} />
      </View>
      {disabled ? null : (
        <View pointerEvents="none" style={[drawn.edge, { borderRadius: l.radius }, error && drawn.edgeError]} />
      )}
    </Pressable>
  );
}

const drawn = StyleSheet.create({
  field: { flex: 1, backgroundColor: tokens.colors.surfaceCard },
  disabled: { backgroundColor: tokens.colors.surfaceTint },
  pressed: { backgroundColor: tokens.colors.surfaceTintSoft },
  icon: { position: "absolute" },
  rule: { position: "absolute", width: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.borderDefault },
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderDefault,
  },
  // 22: the field at fault on a red line 0.7 pt wide.
  edgeError: { borderWidth: 0.7, borderColor: tokens.colors.statusDanger },
});

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
