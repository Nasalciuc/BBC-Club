import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";

type Variant = "inverted" | "primary" | "secondary" | "destructive";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  arrow?: boolean;
  variant?: Variant;
  style?: ViewStyle;
  testID?: string;
};

export function ClubButton({
  label,
  onPress,
  disabled = false,
  arrow = false,
  variant = "inverted",
  style,
  testID,
}: Props) {
  const isSecondary = variant === "secondary";
  const isPrimary = variant === "primary";
  const isDestructive = variant === "destructive";
  const arrowColor =
    isPrimary || isDestructive
      ? Club.colors.textOnDark
      : isSecondary
        ? Club.colors.textOnDark
        : Club.colors.textPrimary;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        isDestructive && styles.destructive,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          isPrimary && styles.primaryLabel,
          isSecondary && styles.secondaryLabel,
          isDestructive && styles.destructiveLabel,
        ]}
      >
        {label}
      </Text>
      {arrow ? <ClubIcon name="arrow" size={20} color={arrowColor} /> : null}
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
  primary: {
    backgroundColor: Club.colors.primary,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Club.colors.borderOnDark,
  },
  destructive: {
    backgroundColor: Club.colors.statusDanger,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    ...Club.type.button,
    color: Club.colors.textPrimary,
  },
  primaryLabel: {
    color: Club.colors.textOnDark,
  },
  secondaryLabel: {
    color: Club.colors.textOnDark,
  },
  destructiveLabel: {
    color: Club.colors.textOnDark,
  },
});
