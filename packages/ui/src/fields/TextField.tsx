import { type ReactNode, useState } from "react";
import { StyleSheet, Text, type TextInputProps, type TextStyle, View } from "react-native";
import { Icon, type IconName } from "../icons";
import { baselineOffset, belowBaseline, rn } from "../rn-type";
import { tokens } from "../tokens";
import { TEXT_REQUEST } from "./field-looks";
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
  /** `request`: the request sheet's (06, 22, 23), as measured. Without one, sheet 39's. */
  look?: "request";
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
  look,
  ...input
}: Props) {
  const [focused, setFocused] = useState(false);
  if (look === "request") {
    const l = TEXT_REQUEST;
    const muted = !editable;
    // 06's note: the placeholder in its own smaller type until words are typed.
    const empty = input.value == null || input.value === "";
    const placeholding = Boolean(empty && input.placeholder && l.value.placeholder);
    const shown = placeholding && l.value.placeholder ? l.value.placeholder : l.value.role;
    const valueBaseline = placeholding ? (l.value.placeholderBaseline ?? l.value.baseline) : l.value.baseline;
    return (
      <View style={[drawn.field, { minHeight: l.height, borderRadius: l.radius }, muted && drawn.disabled]}>
        {icon ? (
          <>
            <View
              style={[
                drawn.icon,
                { left: l.icon.centre - l.icon.size / 2, top: l.height / 2 - l.icon.rise - l.icon.size / 2 },
              ]}
              importantForAccessibility="no-hide-descendants"
            >
              <Icon
                name={icon}
                size={l.icon.size}
                color={muted ? tokens.colors.fillMuted : error ? tokens.colors.statusDanger : tokens.colors.textPrimary}
                strokeWidth={l.icon.stroke}
              />
            </View>
            <View style={[drawn.rule, { left: l.rule.left, top: l.rule.top, bottom: l.rule.bottom }]} />
          </>
        ) : null}
        <View style={{ marginLeft: l.label.left, marginRight: tokens.space.sm }}>
          <Text
            style={[
              l.label.role,
              { color: error ? tokens.colors.statusDangerText : muted ? tokens.colors.chevronLight : l.label.color },
              { marginTop: l.label.baseline - baselineOffset(l.label.role) },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          <SheetTextInput
            {...input}
            testID={testID}
            editable={editable}
            accessibilityLabel={accessibilityLabel ?? label}
            multiline={multiline}
            // One line to start (06's note), growing with what is typed where the platform lets it.
            numberOfLines={multiline ? 1 : undefined}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            placeholderTextColor={muted ? tokens.colors.chevronLight : tokens.colors.fillMuted}
            style={[
              shown,
              styles.inputReset,
              { color: muted ? tokens.colors.fillMuted : tokens.colors.textPrimary },
              {
                marginTop: valueBaseline - l.label.baseline - belowBaseline(l.label.role) - baselineOffset(shown),
                minHeight: shown.lineHeight,
              },
            ]}
          />
        </View>
        {trailing}
        {muted ? null : (
          <View
            pointerEvents="none"
            style={[
              drawn.edge,
              { borderRadius: l.radius },
              focused && !error && drawn.edgeFocus,
              error && drawn.edgeError,
            ]}
          />
        )}
      </View>
    );
  }
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

/** 22: the line's baseline 11.4 under the field's foot, from the field's own left; the next field 10.44 under it. */
const ERROR_REQUEST = { baseline: 11.4, next: 10.44, gap: 8.84 } as const;

/**
 * The red line under a field at fault (22: `Select a return date or choose One way.`). `request`: 22's, measured —
 * the field after it keeps the sheet's gap from the line's foot.
 */
export function FieldError({ children, testID, look }: { children: string; testID?: string; look?: "request" }) {
  if (look === "request") {
    const r = rn(tokens.type.fieldError) as TextStyle & { fontSize: number; lineHeight: number };
    return (
      <Text
        testID={testID}
        style={[
          r,
          styles.danger,
          {
            marginTop: ERROR_REQUEST.baseline - baselineOffset(r),
            marginBottom: ERROR_REQUEST.next - ERROR_REQUEST.gap - belowBaseline(r),
          },
        ]}
        accessibilityLiveRegion="polite"
      >
        {children}
      </Text>
    );
  }
  return (
    <Text testID={testID} style={styles.message} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

const drawn = StyleSheet.create({
  field: { backgroundColor: tokens.colors.surfaceCard },
  disabled: { backgroundColor: tokens.colors.surfaceTint },
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
  edgeFocus: { borderWidth: 0.9, borderColor: tokens.colors.primary },
  edgeError: { borderWidth: 0.7, borderColor: tokens.colors.statusDanger },
});

const styles = StyleSheet.create({
  inputReset: { minWidth: 0, padding: 0, margin: 0, outlineWidth: 0 },
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
  danger: { color: tokens.colors.statusDangerText },
});
