import { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

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

export function ClubInput({ size = "md", style, ...props }: InputProps) {
  return (
    <TextInput
      placeholderTextColor={Club.colors.outline}
      style={[styles.input, size === "lg" && styles.inputLg, style]}
      {...props}
    />
  );
}

type PasswordProps = Omit<InputProps, "secureTextEntry"> & {
  visible: boolean;
  onToggleVisibility: () => void;
};

export function ClubPasswordInput({
  visible,
  onToggleVisibility,
  style,
  size = "lg",
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
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        hitSlop={8}
        onPress={onToggleVisibility}
        style={styles.eye}
      >
        <ClubIcon
          name={visible ? "eyeOff" : "eye"}
          size={20}
          color={Club.colors.secondary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  label: {
    ...Club.type.label,
    color: Club.colors.onPrimaryContainer,
    textTransform: "uppercase",
  },
  input: {
    ...Club.type.body,
    backgroundColor: Club.colors.mist,
    color: Club.colors.navyDeep,
    borderRadius: Club.radius.input,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(197,198,205,0.3)",
  },
  inputLg: {
    ...Club.type.bodyLg,
    paddingVertical: 16,
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
    right: 12,
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
});
