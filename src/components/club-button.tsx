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
};

export function ClubButton({
  label,
  onPress,
  disabled = false,
  arrow = false,
  variant = "primary",
  style,
}: Props) {
  const isSecondary = variant === "secondary";

  return (
    <Pressable
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
          color={isSecondary ? Club.colors.white : Club.colors.navyDeep}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    minHeight: 56,
    backgroundColor: Club.colors.white,
    borderRadius: Club.radius.pill,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(117,119,125,0.3)",
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    ...Club.type.button,
    color: Club.colors.navyDeep,
  },
  secondaryLabel: {
    color: Club.colors.white,
  },
});
