import { StyleSheet, View, type ViewStyle } from "react-native";
import { tokens } from "../tokens";

/** A 1-pt light navy rule (`divider`); `vertical` between two columns of a card. */
export function Divider({ vertical = false, style }: { vertical?: boolean; style?: ViewStyle }) {
  return <View style={[vertical ? styles.vertical : styles.horizontal, style]} />;
}

const styles = StyleSheet.create({
  horizontal: {
    height: StyleSheet.hairlineWidth * 2,
    alignSelf: "stretch",
    backgroundColor: tokens.colors.borderDefault,
  },
  vertical: { width: StyleSheet.hairlineWidth * 2, alignSelf: "stretch", backgroundColor: tokens.colors.borderDefault },
});
