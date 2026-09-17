import { Text, View } from "react-native";
import { tokens, rn } from "@bbc/ui";

/** Stub until commit 2.3 fills the list. Keeps the tab route registered. */
export default function RequestsScreen() {
  return (
    <View
      testID="requests.root"
      style={{ flex: 1, backgroundColor: tokens.colors.surfacePage, padding: tokens.space.lg }}
    >
      <Text style={{ ...rn(tokens.type.title), color: tokens.colors.textPrimary }}>Requests</Text>
    </View>
  );
}
