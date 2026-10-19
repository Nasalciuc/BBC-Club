import { StyleSheet, Text, View } from "react-native";
import { rn } from "../rn-type";
import { tokens } from "../tokens";
import { TextButton } from "./TextButton";

type Props = {
  title: string;
  /** `See all ›`, `Clear all`, `Done`: a text button at the right. */
  action?: { label: string; onPress: () => void; testID: string; chevron?: boolean };
  /** `title` 24 Bold (sections) or `subtitle` 17 Semibold (onboarding's groups, `Other great fares`). */
  size?: "title" | "subtitle";
  testID?: string;
};

/** A section's title with its action at the right (02 `Offers to inspire  See all ›`, 03 `Recent searches  Clear all`). */
export function SectionHeader({ title, action, size = "title", testID }: Props) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[size === "title" ? styles.title : styles.subtitle]} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {action ? (
        <TextButton label={action.label} onPress={action.onPress} testID={action.testID} chevron={action.chevron} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary, flexShrink: 1 },
  subtitle: { ...rn(tokens.type.subtitle), color: tokens.colors.textPrimary, flexShrink: 1 },
});
