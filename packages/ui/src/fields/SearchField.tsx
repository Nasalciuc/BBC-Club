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
  /** The editable field as its screen draws it: `search` (03, 18) by default, `onboarding` (14, 15). */
  look?: "search" | "onboarding";
  testID: string;
};

type Field = {
  height: number;
  radius: number;
  iconLeft: number;
  icon: number;
  iconStroke: number;
  textLeft: number;
  clear: number;
  clearRight: number;
  clearGlyph: number;
  clearStroke: number;
  /** From the field to `Cancel`'s words. */
  cancelGap: number;
};

/**
 * 03 / 18: the field 36.5 pt tall, radius 10.5; the magnifier's box 10.5 pt in; the words 39 pt in; `Cancel` 16 pt
 * right of the field. 14 / 15: 43.8 tall, radius 12, on the notice tint without a hairline; the magnifier 22.5 pt at
 * 11.7 in; the words 44.5 in, navy Medium, their ink 1.3 pt under the middle; the clear button 18.5 across, 12.4 from
 * the edge; `Cancel` navy, 11.1 pt from the field, 1.6 under the middle.
 */
/**
 * 02's bar: 53.7 tall, radius 19, white with the card shadow; the magnifier's 24-pt box 17.6 in at a 1.8 line, the
 * words 55.6 in.
 */
const BAR = { height: 53.7, radius: 19, iconLeft: 17.6, icon: 24, iconStroke: 1.8, textLeft: 55.6 } as const;

const FIELDS: Record<"search" | "onboarding", Field> = {
  search: {
    height: 36.5,
    radius: 10.5,
    iconLeft: 10.5,
    icon: 19.5,
    iconStroke: 2,
    textLeft: 39,
    clear: 16,
    clearRight: 12,
    clearGlyph: 10,
    clearStroke: 2.4,
    cancelGap: 16.1,
  },
  onboarding: {
    height: 43.8,
    radius: 12,
    iconLeft: 11.7,
    icon: 22.5,
    iconStroke: 1.6,
    textLeft: 44.5,
    clear: 18.5,
    clearRight: 12.4,
    clearGlyph: 13.8,
    clearStroke: 2.43,
    cancelGap: 11.1,
  },
};

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
  look: fieldLook = "search",
  testID,
}: Props) {
  const [focused, setFocused] = useState(false);
  const look = tone ?? (editable ? "field" : "bar");
  const g = FIELDS[fieldLook];
  const onb = fieldLook === "onboarding";
  const filled = value != null && value.text.length > 0;
  const shownPlaceholder = disabled ? (disabledReason ?? placeholder) : placeholder;
  const frame = [
    look === "bar" ? styles.bar : styles.field,
    look === "field" && {
      minHeight: g.height,
      borderRadius: g.radius,
      paddingLeft: g.iconLeft,
      paddingRight: g.clearRight,
      gap: g.textLeft - g.iconLeft - g.icon,
    },
    look === "field" && onb && styles.onbField,
    focused && !error && look === "bar" && styles.focused,
    error && styles.error,
    disabled && styles.disabled,
  ];
  const iconColor = look === "bar" ? tokens.colors.textPrimary : tokens.colors.textSecondary;
  const textStyle = look === "bar" ? styles.barText : onb ? styles.onbText : styles.fieldText;
  const icon = (
    <Icon
      name="search"
      size={look === "bar" ? BAR.icon : g.icon}
      color={iconColor}
      strokeWidth={look === "bar" ? BAR.iconStroke : g.iconStroke}
    />
  );

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
        style={[textStyle, styles.input, onb && styles.onbInput]}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        returnKeyType="search"
      />
      {filled && onClear ? <ClearButton testID={testID} onPress={onClear} field={g} onb={onb} /> : null}
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
      {filled && onClear ? <ClearButton testID={testID} onPress={onClear} field={g} onb={onb} /> : null}
    </Pressable>
  );

  if (!onCancel) return field;
  return (
    <View style={[styles.withCancel, { gap: g.cancelGap }]}>
      {field}
      <View style={onb && styles.onbCancel}>
        <TextButton
          testID={`${testID}.cancel`}
          label="Cancel"
          tone={onb ? "primary" : "link"}
          text={onb ? "onboardCancel" : undefined}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

/**
 * The clear button — a light slate circle with a white × (18: 16 pt, 12 from the field's edge; 14: 18.5, 12.4, in the
 * deeper slate); a 44-pt target.
 */
function ClearButton({
  testID,
  onPress,
  field,
  onb,
}: {
  testID: string;
  onPress: () => void;
  field: Field;
  onb: boolean;
}) {
  return (
    <Pressable
      testID={`${testID}.clear`}
      accessibilityRole="button"
      accessibilityLabel="Clear"
      hitSlop={(44 - field.clear) / 2}
      onPress={onPress}
      style={({ pressed }) => [
        styles.clear,
        { width: field.clear, height: field.clear },
        onb && styles.onbClear,
        pressed && styles.clearPressed,
      ]}
    >
      <Icon name="x" size={field.clearGlyph} color={tokens.colors.textOnPhoto} strokeWidth={field.clearStroke} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: BAR.height,
    borderRadius: BAR.radius,
    backgroundColor: tokens.colors.surfaceCard,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: BAR.iconLeft,
    paddingRight: tokens.space.md,
    gap: BAR.textLeft - BAR.iconLeft - BAR.icon,
    ...tokens.elevation.card,
  },
  field: {
    backgroundColor: tokens.colors.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.borderFaint,
    flexDirection: "row",
    alignItems: "center",
  },
  onbField: { backgroundColor: tokens.colors.surfaceNotice, borderWidth: 0 },
  // 14 draws the words and `Cancel` a little under the field's middle.
  onbText: { ...rn(tokens.type.onboardInput), flex: 1 },
  onbInput: { paddingTop: 2.6 },
  onbCancel: { marginTop: 3.3 },
  onbClear: { backgroundColor: tokens.colors.textMuted },
  grow: { flexGrow: 1, flexShrink: 1 },
  focused: { borderColor: tokens.colors.borderStrong },
  error: { borderColor: tokens.colors.statusDanger },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.92 },
  // 02 draws the words a little under the bar's middle.
  barText: { ...rn(tokens.type.searchBar), flex: 1, marginTop: 2.7 },
  fieldText: { ...rn(tokens.type.field), flex: 1 },
  placeholder: { color: tokens.colors.textSecondary },
  filled: { color: tokens.colors.textPrimary },
  input: { color: tokens.colors.textPrimary, minWidth: 0, padding: 0, margin: 0, outlineWidth: 0 },
  clear: {
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.fillMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  clearPressed: { opacity: 0.6 },
  withCancel: { flexDirection: "row", alignItems: "center" },
});
