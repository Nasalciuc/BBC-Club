import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";

type Props = {
  fraction: number;
};

/** 2 pt fill. Full gutter width; caller sets `fraction` (this screen is 1). */
export function ProgressLine({ fraction }: Props) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 1, now: clamped }}>
      <View style={[styles.fill, { width: `${clamped * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 2,
    width: "100%",
    backgroundColor: tokens.colors.borderDefault,
    overflow: "hidden",
  },
  fill: {
    height: 2,
    backgroundColor: tokens.colors.accentWarm,
  },
});
