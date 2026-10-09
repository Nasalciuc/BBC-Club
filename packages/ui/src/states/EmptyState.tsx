import { StyleSheet, Text, View } from "react-native";
import { Button } from "../primitives/Button";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  title: string;
  body: string;
  primary: { label: string; onPress: () => void };
  testID: string;
};

/** No illustrations — title, body, one button. Copy lives in the screen. */
export function EmptyState({ title, body, primary, testID }: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {/* Figma EmptyState: the pill is Tone Primary — the one filled button of a light screen. */}
      <Button
        testID={`${testID}.primary`}
        label={primary.label}
        onPress={primary.onPress}
        variant="primary"
        shape="pill"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: tokens.space.lg,
    alignItems: "stretch",
    gap: tokens.space.sm,
  },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, textAlign: "center" },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary, textAlign: "center" },
});
