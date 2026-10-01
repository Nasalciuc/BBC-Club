import { StyleSheet, Text, View } from "react-native";
import { Button } from "../primitives/Button";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  variant: "error" | "gone" | "offline";
  title: string;
  body: string;
  primary?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  reference?: string;
  testID: string;
};

/** No illustrations. Copy and recovery actions come from the screen. */
export function ErrorState({ title, body, primary, secondary, reference, testID }: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {primary ? (
        <Button testID={`${testID}.primary`} label={primary.label} onPress={primary.onPress} shape="pill" />
      ) : null}
      {secondary ? (
        <Button
          testID={`${testID}.secondary`}
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
