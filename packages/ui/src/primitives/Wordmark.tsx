import { StyleSheet, Text } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** White over a photograph (08); navy on a page (01, 07). */
  tone?: "navy" | "white";
  /** `dates`: the dates page's top bar (07), `BuyBusinessClass` in Bold a little smaller than 01's; 01's by default. */
  look?: "dates";
  testID?: string;
};

/**
 * The wordmark on one line (sheet 37): `BuyBusinessClass` in Semibold, ` Club` in Regular and a little larger, as 01
 * draws it — the two parts share one baseline.
 */
export function Wordmark({ tone = "navy", look, testID }: Props) {
  const color = tone === "white" ? tokens.colors.textOnPhoto : tokens.colors.textPrimary;
  const dates = look === "dates";
  return (
    <Text
      testID={testID}
      style={[dates ? styles.markDates : styles.mark, { color }]}
      accessibilityRole="header"
      accessibilityLabel="BuyBusinessClass Club"
      numberOfLines={1}
    >
      BuyBusinessClass<Text style={dates ? styles.clubDates : styles.club}> Club</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: { ...rn(tokens.type.wordmark) },
  club: { ...rn(tokens.type.wordmarkClub), lineHeight: tokens.type.wordmark.lineHeight },
  markDates: { ...rn(tokens.type.wordmarkDates) },
  clubDates: { ...rn(tokens.type.wordmarkDatesClub), lineHeight: tokens.type.wordmarkDates.lineHeight },
});
