import { StyleSheet, View } from "react-native";
import { Icon } from "../icons";
import { tokens } from "../tokens";

/** The large navy check of a request received (08; sheet 41): a navy circle in a white ring, the white check. */
export function CheckCircle({ testID }: { testID?: string }) {
  return (
    <View style={styles.ring} testID={testID} accessible accessibilityRole="image" accessibilityLabel="Received">
      <View style={styles.circle}>
        <Icon name="check" size={32} color={tokens.colors.textOnPhoto} strokeWidth={3} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 72,
    height: 72,
    borderRadius: tokens.radius.pill,
    padding: 4,
    backgroundColor: tokens.colors.surfaceCard,
    ...tokens.elevation.float,
  },
  circle: {
    flex: 1,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.actionPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
});
