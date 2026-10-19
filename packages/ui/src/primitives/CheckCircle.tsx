import { StyleSheet, View } from "react-native";
import { CheckMark } from "../icons";
import { tokens } from "../tokens";

/**
 * 08, measured (pt): the navy disc 58.3 across in a white ring 4.65 wide — 67.6 across, no shadow; the traced check
 * (27.7 × 20.04) with its box 14.19 left of the disc's middle and 9.7 above it.
 */
const CHECK = { outer: 67.6, disc: 58.3, mark: { height: 20.04, left: -14.19, top: -9.7 } } as const;

/** The large navy check of a request received (08; sheet 41): a navy disc in a white ring, the white check. */
export function CheckCircle({ testID }: { testID?: string }) {
  return (
    <View style={styles.ring} testID={testID} accessible accessibilityRole="image" accessibilityLabel="Received">
      <View style={styles.disc}>
        <View style={styles.mark}>
          <CheckMark height={CHECK.mark.height} color={tokens.colors.textOnPhoto} />
        </View>
      </View>
    </View>
  );
}

/** The ring's outer diameter: a screen centres the check on the sheet's edge by it. */
export const CHECK_CIRCLE_SIZE = CHECK.outer;

const styles = StyleSheet.create({
  ring: {
    width: CHECK.outer,
    height: CHECK.outer,
    borderRadius: CHECK.outer / 2,
    backgroundColor: tokens.colors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
  },
  disc: {
    width: CHECK.disc,
    height: CHECK.disc,
    borderRadius: CHECK.disc / 2,
    backgroundColor: tokens.colors.actionPrimary,
  },
  mark: {
    position: "absolute",
    left: CHECK.disc / 2 + CHECK.mark.left,
    top: CHECK.disc / 2 + CHECK.mark.top,
  },
});
