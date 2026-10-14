import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../primitives/Button";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  variant: "error" | "gone" | "offline";
  title: string;
  body: string;
  primary?: { label: string; onPress: () => void; testID?: string };
  /** Figma ErrorState's support action (50:54, `Call a specialist`): a quiet link under the button, 48 pt tall. */
  secondary?: { label: string; onPress: () => void; testID?: string };
  reference?: string;
  testID: string;
};

/**
 * One recoverable message. Figma ErrorState (50:54): left-aligned — the 28-pt title, the explanation, then 24 pt to the
 * actions: one primary button across the width and, when there is one, the support link 8 pt under it. The parent gives
 * the 24-pt gutters.
 */
export function StateMessage({ title, body, primary, secondary, reference, testID }: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.message}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {primary || secondary ? (
        <View style={styles.actions}>
          {primary ? (
            <Button
              testID={primary.testID ?? `${testID}.primary`}
              label={primary.label}
              onPress={primary.onPress}
              variant="primary"
            />
          ) : null}
          {secondary ? (
            <Pressable
              testID={secondary.testID ?? `${testID}.secondary`}
              accessibilityRole="button"
              accessibilityLabel={secondary.label}
              onPress={secondary.onPress}
              style={({ pressed }) => [styles.support, pressed && styles.supportPressed]}
            >
              <Text style={styles.supportLabel}>{secondary.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {reference ? <Text style={styles.ref}>{`REF ${reference}`}</Text> : null}
    </View>
  );
}

/** Kept so existing screens compile. Same component as StateMessage. */
export const ErrorState = StateMessage;

const styles = StyleSheet.create({
  // Left-aligned across the parent, even in a centring screen: the message never shrinks to its words.
  wrap: { alignSelf: "stretch", alignItems: "stretch", gap: tokens.space.lg },
  message: { gap: tokens.space.sm },
  title: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  actions: { gap: tokens.space.xs },
  support: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: tokens.space.md },
  supportPressed: { opacity: 0.6 },
  supportLabel: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary, textAlign: "center" },
  ref: {
    ...rn(tokens.type.labelMono),
    color: tokens.colors.textTertiary,
    textAlign: "center",
    marginTop: tokens.space.xs,
  },
});
