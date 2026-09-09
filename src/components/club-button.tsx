import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";

type Variant = "primary" | "secondary";

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
  variant = "primary",
  style,
  testID,
}: Props) {
  const isSecondary = variant === "secondary";

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isSecondary && styles.secondary,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, isSecondary && styles.secondaryLabel]}>{label}</Text>
      {arrow ? (
        <ClubIcon
          name="arrow"
          size={20}
          color={isSecondary ? Club.colors.textOnDark : Club.colors.textPrimary}
        />
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
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Club.colors.borderOnDark,
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
  secondaryLabel: {
    color: Club.colors.textOnDark,
  },
});
