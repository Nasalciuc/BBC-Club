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

/**
 * Figma EmptyState (48:18): left-aligned — the 28-pt editorial title, the explanation under it, 24 pt to one primary
 * button across the width. No illustration; copy lives in the screen. The parent gives the 24-pt gutters.
 */
export function EmptyState({ title, body, primary, testID }: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.message}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <Button testID={`${testID}.primary`} label={primary.label} onPress={primary.onPress} variant="primary" />
    </View>
  );
}

const styles = StyleSheet.create({
  // Left-aligned across the parent, even in a centring screen: the message never shrinks to its words.
  wrap: { alignSelf: "stretch", alignItems: "stretch", gap: tokens.space.lg },
  message: { gap: tokens.space.sm },
  title: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
});
