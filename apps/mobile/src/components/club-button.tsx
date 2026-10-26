import { Pressable, StyleSheet, Text } from "react-native";

import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";

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
 * night screens; the outlined button for Create account; 45% while it cannot be pressed. Its values are the entry's own
 * (`Club`), never the club's tokens (ADR-IMPL-055).
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
        <ClubIcon name="arrow" size={20} color={outlined ? Club.colors.textOnDark : Club.colors.textPrimary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    minHeight: 56,
    backgroundColor: Club.colors.actionInverted,
    borderRadius: Club.radius.pill,
    paddingVertical: Club.space.md,
    paddingHorizontal: Club.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Club.space.xs,
  },
  outlined: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Club.colors.textOnDarkMuted,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  label: { ...Club.type.button, color: Club.colors.textPrimary },
  outlinedLabel: { color: Club.colors.textOnDark },
});
