import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { tokens } from "@bbc/ui";

/** Stub — commit 2.3 replaces with the full fare detail. */
export default function FareDetailStub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View testID="fare.root" style={{ flex: 1, backgroundColor: tokens.colors.surfacePage, justifyContent: "center" }}>
      <ActivityIndicator color={tokens.colors.primary} accessibilityLabel={`Loading fare ${id ?? ""}`} />
    </View>
  );
}
