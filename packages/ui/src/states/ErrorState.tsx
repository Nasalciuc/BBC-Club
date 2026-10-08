import { StyleSheet, Text, View } from "react-native";
import { Button } from "../primitives/Button";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  variant: "error" | "gone" | "offline";
  title: string;
  body: string;
  primary?: { label: string; onPress: () => void; testID?: string };
  secondary?: { label: string; onPress: () => void; testID?: string };
  reference?: string;
  testID: string;
};

/** One recoverable message. Figma ErrorState / StateMessage on 135:848. */
export function StateMessage({ title, body, primary, secondary, reference, testID }: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {primary ? (
        // Figma ErrorState / StateMessage: the primary pill is Tone Primary (navy) on the light page.
        <Button
          testID={primary.testID ?? `${testID}.primary`}
          label={primary.label}
          onPress={primary.onPress}
          variant="primary"
          shape="pill"
        />
      ) : null}
      {secondary ? (
        <Button
          testID={secondary.testID ?? `${testID}.secondary`}
          label={secondary.label}
          onPress={secondary.onPress}
          variant="ghost"
          shape="pill"
        />
      ) : null}
      {reference ? <Text style={styles.ref}>{`REF ${reference}`}</Text> : null}
    </View>
  );
}

/** Kept so existing screens compile. Same component as StateMessage. */
export const ErrorState = StateMessage;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: tokens.space.lg,
    alignItems: "stretch",
    gap: tokens.space.sm,
  },
  title: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  ref: {
    ...rn(tokens.type.labelMono),
    color: tokens.colors.textTertiary,
    textAlign: "center",
    marginTop: tokens.space.xl,
  },
});
