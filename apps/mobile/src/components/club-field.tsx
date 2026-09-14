import { ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { ClubIcon } from "@/components/club-icon";
import { Club } from "@/constants/club";

type FieldProps = {
  label: string;
  children: ReactNode;
};

export function ClubField({ label, children }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

type InputProps = TextInputProps & {
  size?: "md" | "lg";
};

export function ClubInput({ size = "md", style, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      placeholderTextColor={Club.colors.textTertiary}
      {...props}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[styles.input, size === "lg" && styles.inputLg, focused && styles.inputFocused, style]}
    />
  );
}

type PasswordProps = Omit<InputProps, "secureTextEntry"> & {
  visible: boolean;
  onToggleVisibility: () => void;
  toggleTestID: string;
};

export function ClubPasswordInput({
  visible,
  onToggleVisibility,
  style,
  size = "lg",
  toggleTestID,
  ...props
}: PasswordProps) {
  return (
    <View style={styles.passwordWrap}>
      <ClubInput
        size={size}
        secureTextEntry={!visible}
        autoCorrect={false}
        autoCapitalize="none"
        style={[styles.passwordInput, style]}
        {...props}
      />
      <Pressable
        testID={toggleTestID}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        hitSlop={Club.space.xs}
        onPress={onToggleVisibility}
        style={styles.eye}
      >
        <ClubIcon name={visible ? "eyeOff" : "eye"} size={20} color={Club.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Club.space.xs,
  },
  label: {
    ...Club.type.labelMono,
    color: Club.colors.textOnDarkMuted,
    textTransform: "uppercase",
  },
  input: {
    ...Club.type.body,
    minHeight: 56,
    backgroundColor: Club.colors.surfaceCard,
    color: Club.colors.textPrimary,
    borderRadius: Club.radius.field,
    paddingHorizontal: Club.space.md,
    paddingVertical: Club.space.sm,
    borderWidth: 1,
    borderColor: Club.colors.borderDefault,
  },
  inputLg: {
    paddingVertical: Club.space.md,
  },
  inputFocused: {
    borderColor: Club.colors.textSecondary,
    borderWidth: 2,
  },
  passwordWrap: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    paddingRight: 48,
  },
  eye: {
    position: "absolute",
    right: Club.space.sm,
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: Club.space.xxs,
  },
});
