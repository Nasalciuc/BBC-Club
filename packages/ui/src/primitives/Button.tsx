import { Pressable, StyleSheet, Text, type TextStyle, type ViewStyle } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

/**
 * Figma Button (7:12): 56 pt, pill, the label alone — no icon, no arrow. Primary on the light screens, Inverted on the
 * dark entry surfaces, Secondary (white with a hairline) beside a filled one, Destructive only to confirm a deletion.
 */
type Variant = "primary" | "inverted" | "secondary" | "destructive";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /**
   * Figma State=Sending (7:10): the button keeps its colour and reads what the caller passes (`Sending…`, `Saving…`);
   * taps are blocked until it settles. No spinner.
   */
  busy?: boolean;
  variant?: Variant;
  style?: ViewStyle;
  testID?: string;
};

export function Button({ label, onPress, disabled = false, busy = false, variant = "inverted", style, testID }: Props) {
  const blocked = disabled || busy;
  const dimmed = disabled && !busy;
  // Figma draws Primary · Disabled (7:8) as the muted fill at half opacity with a muted label. The other tones dim as a
  // whole, as the entry's Sign in does before the fields are filled (66:182, 45%).
  const mutedPrimary = dimmed && variant === "primary";

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        TONE[variant],
        mutedPrimary ? styles.primaryDisabled : dimmed ? styles.dimmed : null,
        pressed && !blocked && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, LABEL[variant], mutedPrimary && styles.primaryDisabledLabel]}>{label}</Text>
    </Pressable>
  );
}

const TONE: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: tokens.colors.actionPrimary },
  inverted: { backgroundColor: tokens.colors.actionInverted },
  secondary: {
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  destructive: { backgroundColor: tokens.colors.statusDanger },
};

const LABEL: Record<Variant, TextStyle> = {
  primary: { color: tokens.colors.textOnDark },
  inverted: { color: tokens.colors.textPrimary },
  secondary: { color: tokens.colors.textPrimary },
  destructive: { color: tokens.colors.textOnDark },
};

const styles = StyleSheet.create({
  button: {
    width: "100%",
    minHeight: 56,
    borderRadius: tokens.radius.pill,
    padding: tokens.space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
  },
  primaryDisabled: { backgroundColor: tokens.colors.surfaceMuted, opacity: 0.5 },
  dimmed: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.98 }] },
  label: { ...rn(tokens.type.button), textAlign: "center" },
  primaryDisabledLabel: { color: tokens.colors.textOnDarkMuted },
});
