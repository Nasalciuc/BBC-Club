import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Club } from "@/constants/club";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  // TODO(tabs): replaced by (tabs)/proposals in the next stage
  return (
    <View style={[styles.root, { paddingTop: insets.top + Club.space.lg }]}>
      <Text style={styles.title}>Proposals</Text>
      <Text style={styles.body}>Your proposals will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Club.colors.surfacePage,
    paddingHorizontal: Club.space.gutter,
  },
  title: {
    ...Club.type.display,
    color: Club.colors.textPrimary,
    marginBottom: Club.space.sm,
  },
  body: {
    ...Club.type.body,
    color: Club.colors.textSecondary,
  },
});
