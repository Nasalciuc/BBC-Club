import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Club } from "@/constants/club";

/** Stub waitlist — Block 5 may expand; waitlist members must not land on the proposals feed. */
export default function WaitlistScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View testID="waitlist.root" style={[styles.root, { paddingTop: insets.top + Club.space.lg }]}>
      <StatusBar style="dark" />
      <Text style={styles.kicker}>You're on the list</Text>
      <Text style={styles.title}>We'll be in touch</Text>
      <Text style={styles.body}>
        Thanks for joining. An advisor will recognise your email and open the club when you're ready to fly.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Club.colors.surfacePage,
    paddingHorizontal: Club.space.gutter,
  },
  kicker: {
    ...Club.type.labelMono,
    color: Club.colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: Club.space.sm,
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
