import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  placeholder: string;
  value?: { prefix?: string; text: string } | null;
  onPress?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** When true, renders a TextInput so sheets can type a query. */
  editable?: boolean;
  onChangeText?: (text: string) => void;
  /** Editable only: focus and raise the keyboard as the field appears (Figma 89:388 opens typing). */
  autoFocus?: boolean;
  testID: string;
};

/** Default: not a TextInput — tapping raises a sheet. Set `editable` for inline typing. Disabled is never hidden. */
export function SearchField({
  placeholder,
  value,
  onPress,
  onClear,
  disabled = false,
  disabledReason,
  editable = false,
  onChangeText,
  autoFocus = false,
  testID,
}: Props) {
  const filled = value != null && value.text.length > 0;

  if (editable) {
    return (
      <View
        style={[styles.field, filled && styles.filled, disabled && styles.disabled]}
        accessibilityState={{ disabled }}
      >
        <Icon name={filled ? "departure" : "search"} size={20} />
        <TextInput
          testID={testID}
          editable={!disabled}
          value={value?.text ?? ""}
          onChangeText={onChangeText}
          placeholder={disabled ? (disabledReason ?? placeholder) : placeholder}
          placeholderTextColor={tokens.colors.textTertiary}
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
      accessibilityLabel={
        filled ? `${value.prefix ?? ""}${value.text}` : disabled ? (disabledReason ?? placeholder) : placeholder
      }
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.field,
        filled && styles.filled,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Icon name={filled ? "departure" : "search"} size={20} />
      {filled ? (
        <Text style={styles.text} numberOfLines={1}>
          {value.prefix ? <Text style={styles.prefix}>{value.prefix}</Text> : null}
          {value.text}
        </Text>
      ) : (
        <Text style={styles.placeholder} numberOfLines={1}>
          {disabled ? (disabledReason ?? placeholder) : placeholder}
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
  filled: { borderColor: tokens.colors.primary },
  disabled: { backgroundColor: "transparent", borderStyle: "dashed" },
  pressed: { opacity: 0.9 },
  placeholder: { ...rn(tokens.type.body), color: tokens.colors.textTertiary, flex: 1 },
  text: { ...rn(tokens.type.body), color: tokens.colors.textPrimary, flex: 1 },
  prefix: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
  input: {
    ...rn(tokens.type.body),
    color: tokens.colors.textPrimary,
    flex: 1,
    padding: 0,
    margin: 0,
  },
  clear: { minHeight: 44, justifyContent: "center", paddingLeft: tokens.space.xs },
  clearPressed: { opacity: 0.6 },
  clearLabel: { ...rn(tokens.type.bodySm), color: tokens.colors.textPrimary },
});
