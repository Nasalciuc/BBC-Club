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
   * `bar`: Explore's white search bar with the card shadow (02). `field`: light tint while searching (03, 14, 18) — the
   * default for an editable field.
   */
  tone?: "bar" | "field";
  /** `Cancel` at the field's right, outside it (03, 14). */
  onCancel?: () => void;
  testID: string;
};

/**
 * The search field (sheet 39): the magnifier, the words; filled, a clear button (a slate circle with a white ×) at the
 * right edge; `Cancel` beside the field while searching. Not editable, it is a button that opens the search.
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
    focused && !error && look === "field" && styles.focused,
    error && styles.error,
    disabled && styles.disabled,
  ];
  const iconColor = look === "bar" ? tokens.colors.textPrimary : tokens.colors.textSecondary;
  const textStyle = look === "bar" ? styles.barText : styles.fieldText;

  const field = editable ? (
    <View style={[...frame, styles.grow]} accessibilityState={{ disabled }}>
      <Icon name="search" size={look === "bar" ? 24 : 22} color={iconColor} strokeWidth={2} />
      <SheetTextInput
        testID={testID}
        editable={!disabled}
        value={value?.text ?? ""}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={shownPlaceholder}
        placeholderTextColor={tokens.colors.textSecondary}
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
      <Icon name="search" size={look === "bar" ? 24 : 22} color={iconColor} strokeWidth={2} />
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
      <TextButton testID={`${testID}.cancel`} label="Cancel" onPress={onCancel} />
    </View>
  );
}

/** The clear circle, 22 across, and the 44-pt target it reaches to. */
const CLEAR = 22;
const TARGET = 44;

/** The clear button of sheet 39: a slate circle with a white ×, in a 44-pt target. */
function ClearButton({ testID, onPress }: { testID: string; onPress: () => void }) {
  return (
    <Pressable
      testID={`${testID}.clear`}
      accessibilityRole="button"
      accessibilityLabel="Clear"
      hitSlop={(TARGET - CLEAR) / 2}
      onPress={onPress}
      style={({ pressed }) => [styles.clear, pressed && styles.clearPressed]}
    >
      <Icon name="x" size={14} color={tokens.colors.textOnPhoto} strokeWidth={3} />
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
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceTint,
    borderWidth: 1,
    borderColor: tokens.colors.surfaceTint,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.space.md,
    gap: tokens.space.sm,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  focused: { borderColor: tokens.colors.borderDefault },
  error: { borderColor: tokens.colors.statusDanger },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.92 },
  barText: { ...rn(tokens.type.bodyLg), flex: 1 },
  fieldText: { ...rn(tokens.type.bodyLg), flex: 1 },
  placeholder: { color: tokens.colors.textSecondary },
  filled: { color: tokens.colors.textPrimary },
  input: { color: tokens.colors.textPrimary, minWidth: 0, padding: 0, margin: 0, outlineWidth: 0 },
  clear: {
    width: CLEAR,
    height: CLEAR,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.textSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  clearPressed: { opacity: 0.6 },
  withCancel: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
});
