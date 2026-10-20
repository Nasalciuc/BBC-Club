import { type ReactNode, useState } from "react";
import { StyleSheet, Text, type TextInputProps, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { SheetTextInput } from "./SheetTextInput";

type Props = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  label: string;
  /** The icon in its column at the left (`user`, `phone`, `mail`, `message`, `lock`). */
  icon?: IconName;
  /** 1.0 prop, kept for the screens still moving to 3.0: the label now always sits inside the field, over the words. */
  labelTone?: "mono" | "caption" | "bodySm";
  /** A red border; the words that explain it sit under the field, in the screen (`FieldError`). */
  error?: boolean;
  /** Inside the field at its right edge — the password's eye. */
  trailing?: ReactNode;
  testID: string;
};

/**
 * A text field (sheet 39; 06): white, a light navy hairline, radius 12 — the icon in its column and a rule, then the
 * label in slate over the words. Focus: a navy border. Error: a red border. Not editable: light tint.
 */
export function TextField({
  label,
  icon,
  error = false,
  trailing,
  testID,
  multiline,
  editable = true,
  onFocus,
  onBlur,
  accessibilityLabel,
  labelTone: _labelTone,
  ...input
}: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[styles.field, !editable && styles.disabled, focused && !error && styles.focused, error && styles.error]}
    >
      {icon ? (
        <>
          <View style={styles.iconCol}>
            <Icon name={icon} size={22} color={tokens.colors.textPrimary} strokeWidth={1.5} />
          </View>
          <View style={styles.rule} />
        </>
      ) : null}
      <View style={styles.text}>
        <Text style={[styles.label, error && styles.labelError]} numberOfLines={1}>
          {label}
        </Text>
        <SheetTextInput
          {...input}
          testID={testID}
          editable={editable}
          accessibilityLabel={accessibilityLabel ?? label}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={tokens.colors.textSecondary}
          style={[styles.input, !editable && styles.inputDisabled]}
        />
      </View>
      {trailing}
    </View>
  );
}

/** The red line under a field at fault (22: `Select a return date or choose One way.`). */
export function FieldError({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text testID={testID} style={styles.message} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.xs,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceCard,
  },
  disabled: { backgroundColor: tokens.colors.surfaceTint },
  focused: { borderColor: tokens.colors.primary, borderWidth: 1.5, paddingHorizontal: tokens.space.md - 0.5 },
  error: { borderColor: tokens.colors.statusDanger, borderWidth: 1.5, paddingHorizontal: tokens.space.md - 0.5 },
  iconCol: { width: 24, alignItems: "center" },
  rule: {
    width: StyleSheet.hairlineWidth * 2,
    alignSelf: "stretch",
    backgroundColor: tokens.colors.borderDefault,
    marginVertical: -tokens.space.xs,
  },
  text: { flex: 1, gap: 2 },
  label: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  labelError: { color: tokens.colors.statusDangerText },
  input: {
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    minWidth: 0,
    padding: 0,
    margin: 0,
    outlineWidth: 0,
  },
  inputDisabled: { color: tokens.colors.textSecondary },
  message: { ...rn(tokens.type.bodySm), color: tokens.colors.statusDangerText, marginTop: tokens.space.xs },
});
