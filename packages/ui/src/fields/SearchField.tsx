import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { TextButton } from "../primitives/TextButton";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { SheetTextInput } from "./SheetTextInput";

type Props = {
  placeholder: string;
  /** The text shown once filled. `prefix` reads on the same line (`JFK → ` before `London · LHR`). */
  value?: { prefix?: string; text: string } | null;
  onPress?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** A red border; the explanation sits under the field, in the screen. */
  error?: boolean;
  /** A TextInput the member types in (Search, 03; onboarding's airport, 14). */
  editable?: boolean;
  onChangeText?: (text: string) => void;
  autoFocus?: boolean;
  /**
   * `bar`: Explore's white search bar with the card shadow (02). `field`: light tint while searching (03, 18, 14) — the
   * default for an editable field.
   */
  tone?: "bar" | "field";
  /** `Cancel` at the field's right, outside it (03, 14). */
  onCancel?: () => void;
  testID: string;
};

/** 03 / 18: the field 36.5 pt tall, radius 10.5; the magnifier's box 10.5 pt in; the words 39 pt in. */
const FIELD = {
  height: 36.5,
  radius: 10.5,
  iconLeft: 10.5,
  icon: 19.5,
  textLeft: 39,
  clear: 16,
  clearRight: 12,
} as const;
/** 03: `Cancel` 16 pt right of the field. */
const CANCEL_GAP = 16.1;

/**
 * The search field (sheet 39; measured on 03 and 18): the magnifier, the words; filled, a clear button (a light slate
 * circle with a white ×) at the right edge; `Cancel` beside the field while searching. Not editable, it is a button
 * that opens the search.
 */
export function SearchField({
  placeholder,
  value,
  onPress,
  onClear,
  disabled = false,
  disabledReason,
  error = false,
  editable = false,
  onChangeText,
  autoFocus = false,
  tone,
  onCancel,
  testID,
}: Props) {
  const [focused, setFocused] = useState(false);
  const look = tone ?? (editable ? "field" : "bar");
  const filled = value != null && value.text.length > 0;
  const shownPlaceholder = disabled ? (disabledReason ?? placeholder) : placeholder;
  const frame = [
    look === "bar" ? styles.bar : styles.field,
    focused && !error && look === "bar" && styles.focused,
    error && styles.error,
    disabled && styles.disabled,
  ];
  const iconColor = look === "bar" ? tokens.colors.textPrimary : tokens.colors.textSecondary;
  const textStyle = look === "bar" ? styles.barText : styles.fieldText;
  const icon = <Icon name="search" size={look === "bar" ? 24 : FIELD.icon} color={iconColor} strokeWidth={2} />;

  const field = editable ? (
    <View style={[...frame, styles.grow]} accessibilityState={{ disabled }}>
      {icon}
      <SheetTextInput
        testID={testID}
        editable={!disabled}
        value={value?.text ?? ""}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={shownPlaceholder}
        placeholderTextColor={tokens.colors.textSecondary}
        selectionColor={tokens.colors.textPrimary}
        style={[textStyle, styles.input]}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        returnKeyType="search"
      />
      {filled && onClear ? <ClearButton testID={testID} onPress={onClear} /> : null}
    </View>
  ) : (
    <Pressable
      testID={testID}
      accessibilityRole="search"
      accessibilityState={{ disabled }}
      accessibilityLabel={filled ? `${value.prefix ?? ""}${value.text}` : shownPlaceholder}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [...frame, styles.grow, pressed && !disabled && styles.pressed]}
    >
      {icon}
      {filled ? (
        <Text style={[textStyle, styles.filled]} numberOfLines={1}>
          {`${value.prefix ?? ""}${value.text}`}
        </Text>
      ) : (
        <Text style={[textStyle, styles.placeholder]} numberOfLines={1}>
          {shownPlaceholder}
        </Text>
      )}
      {filled && onClear ? <ClearButton testID={testID} onPress={onClear} /> : null}
    </Pressable>
  );

  if (!onCancel) return field;
  return (
    <View style={styles.withCancel}>
      {field}
      <TextButton testID={`${testID}.cancel`} label="Cancel" tone="link" onPress={onCancel} />
    </View>
  );
}

/** 18: the clear button — a 16-pt light slate circle with a white ×, 12 pt from the field's edge; a 44-pt target. */
function ClearButton({ testID, onPress }: { testID: string; onPress: () => void }) {
  return (
    <Pressable
      testID={`${testID}.clear`}
      accessibilityRole="button"
      accessibilityLabel="Clear"
      hitSlop={14}
      onPress={onPress}
      style={({ pressed }) => [styles.clear, pressed && styles.clearPressed]}
    >
      <Icon name="x" size={10} color={tokens.colors.textOnPhoto} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    borderRadius: tokens.radius.xl,
    backgroundColor: tokens.colors.surfaceCard,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.space.gutter,
    gap: tokens.space.md,
    ...tokens.elevation.card,
  },
  field: {
    minHeight: FIELD.height,
    borderRadius: FIELD.radius,
    backgroundColor: tokens.colors.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: FIELD.iconLeft,
    paddingRight: FIELD.clearRight,
    gap: FIELD.textLeft - FIELD.iconLeft - FIELD.icon,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  focused: { borderColor: tokens.colors.borderStrong },
  error: { borderColor: tokens.colors.statusDanger },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.92 },
  barText: { ...rn(tokens.type.bodyLg), flex: 1 },
  fieldText: { ...rn(tokens.type.field), flex: 1 },
  placeholder: { color: tokens.colors.textSecondary },
  filled: { color: tokens.colors.textPrimary },
  input: { color: tokens.colors.textPrimary, minWidth: 0, padding: 0, margin: 0, outlineWidth: 0 },
  clear: {
    width: FIELD.clear,
    height: FIELD.clear,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.fillMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  clearPressed: { opacity: 0.6 },
  withCancel: { flexDirection: "row", alignItems: "center", gap: CANCEL_GAP },
});
