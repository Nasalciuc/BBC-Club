import { StyleSheet, Text } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** White over a photograph (08); navy on a page (01, 07). */
  tone?: "navy" | "white";
  testID?: string;
};

/** The wordmark on one line (sheet 37): `BuyBusinessClass` in Bold, ` Club` in Regular. */
export function Wordmark({ tone = "navy", testID }: Props) {
  const color = tone === "white" ? tokens.colors.textOnPhoto : tokens.colors.textPrimary;
  return (
    <Text
      testID={testID}
      style={[styles.mark, { color }]}
      accessibilityRole="header"
      accessibilityLabel="BuyBusinessClass Club"
      numberOfLines={1}
    >
      BuyBusinessClass<Text style={styles.club}> Club</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: { ...rn(tokens.type.wordmark) },
  club: {
    ...rn(tokens.type.body),
    fontSize: tokens.type.wordmark.fontSize,
    letterSpacing: tokens.type.wordmark.letterSpacing,
  },
});
