import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BackButton } from "../primitives/BackButton";
import { Wordmark } from "../primitives/Wordmark";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** The page's name beside the back chevron (`Settings`, `Edit profile`, 34, 36); none — the wordmark in the middle (07). */
  title?: string;
  onBack?: () => void;
  backTestID?: string;
  /** At the right: the round profile button (07). */
  right?: ReactNode;
  testID?: string;
};

/** The top bar (sheet 42): the back chevron, the wordmark centred or the page's title beside it, an action at the right. */
export function TopBar({ title, onBack, backTestID = "topbar.back", right, testID }: Props) {
  return (
    <View style={styles.bar} testID={testID}>
      {onBack ? <BackButton testID={backTestID} onPress={onBack} variant="plain" /> : <View style={styles.side} />}
      {title ? (
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.centre}>
          <Wordmark />
        </View>
      )}
      {right ?? (title ? null : <View style={styles.side} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.sm,
  },
  side: { width: 44, height: 44 },
  centre: { flex: 1, alignItems: "center" },
  title: { ...rn(tokens.type.headline), color: tokens.colors.textPrimary, flex: 1 },
});
