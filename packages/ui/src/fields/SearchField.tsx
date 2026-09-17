import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  placeholder: string;
  value?: { prefix?: string; text: string } | null;
  onPress: () => void;
  onClear?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  testID: string;
};

/** Not a TextInput: tapping raises a sheet. Disabled is never hidden. */
export function SearchField({ placeholder, value, onPress, onClear, disabled = false, disabledReason, testID }: Props) {
  const filled = value != null;

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
      {filled && onClear ? (
        <Pressable
          testID={`${testID}.clear`}
          accessibilityRole="button"
          accessibilityLabel="Clear destination"
          hitSlop={12}
          onPress={onClear}
          style={styles.clear}
        >
          <Icon name="clear" size={16} />
        </Pressable>
      ) : null}
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
  clear: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    alignItems: "center",
    justifyContent: "center",
  },
});
