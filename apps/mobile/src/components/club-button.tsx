import { Pressable, StyleSheet, Text } from "react-native";
import { Icon, rn, tokens } from "@bbc/ui";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** The arrow directly after the label. */
  arrow?: boolean;
  /** `secondary`: the outlined button on navy — Sign in's Create account, under NEW TO THE CLUB. */
  variant?: "inverted" | "secondary";
  testID?: string;
};

/**
 * The entry's button, exactly as the entry has it: the owner keeps the entry as it is (14 Oct, ADR-IMPL-046), so its
 * screens do not take Figma's `Button` (no arrow, no outlined button on navy). The light pill with its arrow on the
 * night screens; the outlined button for Create account; 45% while it cannot be pressed.
 */
export function ClubButton({ label, onPress, disabled = false, arrow = false, variant = "inverted", testID }: Props) {
  const outlined = variant === "secondary";

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        outlined && styles.outlined,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, outlined && styles.outlinedLabel]}>{label}</Text>
      {arrow ? (
        <Icon name="arrow" size={20} color={outlined ? tokens.colors.textOnDark : tokens.colors.textPrimary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    minHeight: 56,
    backgroundColor: tokens.colors.actionInverted,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.xs,
  },
  outlined: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: tokens.colors.textOnDarkMuted,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  label: { ...rn(tokens.type.button), color: tokens.colors.textPrimary },
  outlinedLabel: { color: tokens.colors.textOnDark },
});
