import { View, Text } from "react-native";
import { tokens, rn } from "@bbc/ui";

/** Stub — commit 2.3 fills notification preference toggles. */
export default function NotificationsStub() {
  return (
    <View
      testID="notifications.root"
      style={{ flex: 1, backgroundColor: tokens.colors.surfacePage, padding: tokens.space.lg }}
    >
      <Text style={{ ...rn(tokens.type.title), color: tokens.colors.textPrimary }}>Notifications</Text>
    </View>
  );
}
