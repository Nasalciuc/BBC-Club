import { StyleSheet, Text } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** White over a photograph (08); navy on a page (01, 07). */
  tone?: "navy" | "white";
  /**
   * `dates`: the dates page's top bar (07), `BuyBusinessClass` in Bold a little smaller than 01's; `received`: over 08's
   * photograph, a little larger than 01's; 01's by default.
   */
  look?: "dates" | "received";
  testID?: string;
};

/**
 * The wordmark on one line (sheet 37): `BuyBusinessClass` in Semibold, ` Club` in Regular and a little larger, as 01
 * draws it — the two parts share one baseline.
 */
export function Wordmark({ tone = "navy", look, testID }: Props) {
  const color = tone === "white" ? tokens.colors.textOnPhoto : tokens.colors.textPrimary;
  const [mark, club] = look === "dates" ? DATES : look === "received" ? RECEIVED : PLAIN;
  return (
    <Text
      testID={testID}
      style={[mark, { color }]}
      accessibilityRole="header"
      accessibilityLabel="BuyBusinessClass Club"
      numberOfLines={1}
    >
      BuyBusinessClass
      <Text style={club}>
        {look === "received" ? <Text style={styles.spaceReceived}> </Text> : " "}
        Club
      </Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: { ...rn(tokens.type.wordmark) },
  club: { ...rn(tokens.type.wordmarkClub), lineHeight: tokens.type.wordmark.lineHeight },
  markDates: { ...rn(tokens.type.wordmarkDates) },
  clubDates: { ...rn(tokens.type.wordmarkDatesClub), lineHeight: tokens.type.wordmarkDates.lineHeight },
  markReceived: { ...rn(tokens.type.wordmarkReceived) },
  clubReceived: { ...rn(tokens.type.wordmarkReceivedClub), lineHeight: tokens.type.wordmarkReceived.lineHeight },
  // 08 sets ` Club` 0.98 further from `BuyBusinessClass` than a space of its size: the space alone is tracked wider.
  spaceReceived: { letterSpacing: tokens.type.wordmarkReceivedClub.letterSpacing + 0.98 },
});

const PLAIN = [styles.mark, styles.club] as const;
const DATES = [styles.markDates, styles.clubDates] as const;
const RECEIVED = [styles.markReceived, styles.clubReceived] as const;
