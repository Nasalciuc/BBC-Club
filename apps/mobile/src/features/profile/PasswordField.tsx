import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Icon, type IconName, TextField, tokens } from "@bbc/ui";

type Props = {
  testID: string;
  label: string;
  labelTone: "caption" | "bodySm";
  value: string;
  onChangeText: (next: string) => void;
  /** The danger border; the words that explain it sit under the field, in the sheet. */
  error?: boolean;
  autoFocus?: boolean;
  /** The field's icon in its column (35: the lock). */
  icon?: IconName;
  /** `delete`: 35's — `Password` alone in the field, the filled lock before it, no eye (35 draws none). */
  look?: "delete";
};

/**
 * Figma's password field (319:202, 238:4974): the text field with `Enter password` and, at its right edge, the eye in a
 * 44-pt target that shows or hides what was typed.
 */
export function PasswordField({ testID, label, labelTone, value, onChangeText, error, autoFocus, icon, look }: Props) {
  const [visible, setVisible] = useState(false);
  if (look === "delete") {
    return (
      <TextField
        testID={testID}
        look="delete"
        label={label}
        icon={icon}
        value={value}
        onChangeText={onChangeText}
        error={error}
        autoFocus={autoFocus}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
      />
    );
  }
  return (
    <TextField
      testID={testID}
      label={label}
      labelTone={labelTone}
      icon={icon}
      value={value}
      onChangeText={onChangeText}
      error={error}
      autoFocus={autoFocus}
      placeholder="Enter password"
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="password"
      trailing={
        <Pressable
          testID={`${testID}.toggle`}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          onPress={() => setVisible((v) => !v)}
          style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
        >
          <Icon name={visible ? "eyeOff" : "eye"} size={20} color={tokens.colors.textSecondary} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  eye: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
});
