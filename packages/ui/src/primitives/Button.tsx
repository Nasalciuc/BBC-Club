import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { Icon } from "../icons";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Variant = "inverted" | "primary" | "secondary" | "destructive" | "ghost";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  arrow?: boolean;
  variant?: Variant;
  /** "pill" is the entry-screen shape and stays the default so no existing screen shifts. */
  shape?: "pill" | "card";
  style?: ViewStyle;
  testID?: string;
};

export function Button({
  label,
  onPress,
  disabled = false,
  busy = false,
  arrow = false,
  variant = "inverted",
  shape = "pill",
  style,
  testID,
}: Props) {
  const blocked = disabled || busy;
  const isSecondary = variant === "secondary";
  const isPrimary = variant === "primary";
  const isDestructive = variant === "destructive";
  const isGhost = variant === "ghost";
  const arrowColor =
    isPrimary || isDestructive
      ? tokens.colors.textOnDark
      : isSecondary
        ? tokens.colors.textOnDark
        : tokens.colors.textPrimary;
  const spinnerColor = isPrimary || isDestructive || isSecondary ? tokens.colors.textOnDark : tokens.colors.textPrimary;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        shape === "card" && styles.card,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        isDestructive && styles.destructive,
        isGhost && styles.ghost,
        pressed && !blocked && styles.pressed,
        blocked && styles.disabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <>
          <Text
            style={[
              styles.label,
              isPrimary && styles.primaryLabel,
              isSecondary && styles.secondaryLabel,
              isDestructive && styles.destructiveLabel,
              isGhost && styles.ghostLabel,
            ]}
          >
            {label}
          </Text>
          {arrow ? <Icon name="arrow" size={20} color={arrowColor} /> : null}
        </>
      )}
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
  card: { borderRadius: tokens.radius.card },
  primary: { backgroundColor: tokens.colors.primary },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: tokens.colors.textOnDarkMuted,
  },
  destructive: { backgroundColor: tokens.colors.statusDanger },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  label: { ...rn(tokens.type.button), color: tokens.colors.textPrimary },
  primaryLabel: { color: tokens.colors.textOnDark },
  secondaryLabel: { color: tokens.colors.textOnDark },
  destructiveLabel: { color: tokens.colors.textOnDark },
  ghostLabel: { color: tokens.colors.textPrimary },
});
