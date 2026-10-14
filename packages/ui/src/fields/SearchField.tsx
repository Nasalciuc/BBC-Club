import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useContext, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../icons";
import { InModalSheet } from "../layout/in-modal-sheet";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  placeholder: string;
  /** The text shown once filled. `prefix` reads on the same line, in the same type (`JFK → ` before `London · LHR`). */
  value?: { prefix?: string; text: string } | null;
  onPress?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Figma State=Error (28:14): the danger border. The explanation sits under the field, in the screen. */
  error?: boolean;
  /** When true, renders a TextInput so sheets can type a query. */
  editable?: boolean;
  onChangeText?: (text: string) => void;
  /** Editable only: focus and raise the keyboard as the field appears (Figma 89:388 opens typing). */
  autoFocus?: boolean;
  testID: string;
};

/**
 * Figma SearchField (28:42): 56 pt, white, the field's 12-pt radius, the magnifier at the left in every state.
 * Placeholder in `text-secondary`; focus strengthens the border to 1.5 pt `text-secondary`; an error is the danger
 * border; disabled dims the whole field to 40%. Default: not a TextInput — tapping raises a sheet. Set `editable` for
 * inline typing.
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
  testID,
}: Props) {
  const [focused, setFocused] = useState(false);
  // Inside a modal sheet the field is gorhom's input: the sheet rises with the keyboard, its actions above the keys. Not
  // on the web, which has no keyboard to rise above, and where gorhom's input calls a TextInput API it lacks.
  const Input = useContext(InModalSheet) && Platform.OS !== "web" ? BottomSheetTextInput : TextInput;
  const filled = value != null && value.text.length > 0;
  const shownPlaceholder = disabled ? (disabledReason ?? placeholder) : placeholder;
  const frame = [styles.field, focused && !error && styles.focused, error && styles.error, disabled && styles.disabled];

  if (editable) {
    return (
      <View style={frame} accessibilityState={{ disabled }}>
        <Icon name="search" size={20} color={tokens.colors.textSecondary} />
        <Input
          testID={testID}
          editable={!disabled}
          value={value?.text ?? ""}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={shownPlaceholder}
          placeholderTextColor={tokens.colors.textSecondary}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={autoFocus}
        />
        {filled && onClear ? <ClearLink testID={testID} onPress={onClear} /> : null}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="search"
      accessibilityState={{ disabled }}
      accessibilityLabel={filled ? `${value.prefix ?? ""}${value.text}` : shownPlaceholder}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [...frame, pressed && !disabled && styles.pressed]}
    >
      <Icon name="search" size={20} color={tokens.colors.textSecondary} />
      {filled ? (
        <Text style={styles.text} numberOfLines={1}>
          {`${value.prefix ?? ""}${value.text}`}
        </Text>
      ) : (
        <Text style={[styles.placeholder, disabled && styles.disabledText]} numberOfLines={1}>
          {shownPlaceholder}
        </Text>
      )}
      {filled && onClear ? <ClearLink testID={testID} onPress={onClear} /> : null}
    </Pressable>
  );
}

/** Figma SearchField · Filled / Focused: `Clear` is a text link at the field's right edge (89:387, 89:388), not an ×. */
function ClearLink({ testID, onPress }: { testID: string; onPress: () => void }) {
  return (
    <Pressable
      testID={`${testID}.clear`}
      accessibilityRole="button"
      accessibilityLabel="Clear"
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      onPress={onPress}
      style={({ pressed }) => [styles.clear, pressed && styles.clearPressed]}
    >
      <Text style={styles.clearLabel}>Clear</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 56,
    borderRadius: tokens.radius.field,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.space.md,
    gap: tokens.space.sm,
  },
  // 28:6: the border thickens to 1.5 pt; the padding gives up the half point so nothing inside moves.
  focused: { borderWidth: 1.5, borderColor: tokens.colors.textSecondary, paddingHorizontal: tokens.space.md - 0.5 },
  error: { borderColor: tokens.colors.statusDanger },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.9 },
  placeholder: { ...rn(tokens.type.body), color: tokens.colors.textSecondary, flex: 1 },
  // 28:18: the disabled field reads its words in `text-primary`, dimmed with the field.
  disabledText: { color: tokens.colors.textPrimary },
  text: { ...rn(tokens.type.body), color: tokens.colors.textPrimary, flex: 1 },
  input: {
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    flex: 1,
    // A web <input> keeps its intrinsic width in a row and would squeeze the magnifier; it may shrink instead.
    minWidth: 0,
    padding: 0,
    margin: 0,
  },
  clear: { minHeight: 44, justifyContent: "center", paddingLeft: tokens.space.xs },
  clearPressed: { opacity: 0.6 },
  clearLabel: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
});
