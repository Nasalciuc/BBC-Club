import { StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";

type Props = {
  /** The saving in whole percent, as `savingPercent` works it out from the published fare on record. */
  percent: number;
  /** `fill` spans its row (an offer card's foot, 02); otherwise it hugs its words. */
  fill?: boolean;
  testID?: string;
};

/** The discount pill (sheet 41): `Save 48%` in navy on light navy. Shown only where the published fare is on record. */
export function SavePill({ percent, fill = false, testID }: Props) {
  return (
    <View style={[styles.pill, fill && styles.fill]} testID={testID}>
      <Text style={styles.text} numberOfLines={1}>{`Save ${percent}%`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 28,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.sm,
    backgroundColor: tokens.colors.borderDefault,
  },
  fill: { alignSelf: "stretch", paddingHorizontal: tokens.space.xs },
  text: { ...rn(tokens.type.labelStrong), color: tokens.colors.textPrimary },
});
