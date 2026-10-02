import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, Button, TabBar, tokens, rn } from "@bbc/ui";

import { telHref } from "@/features/requests/confirmation-logic";
import { env } from "@/lib/env";

export default function RequestLimitedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ minutes?: string }>();
  const minutes = Number(params.minutes);
  const shown = Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
  const call = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);
  const openTab = (key: "explore" | "requests" | "profile") => {
    router.push(
      (key === "requests" ? "/(tabs)/requests" : key === "profile" ? "/(tabs)/profile" : "/(tabs)/explore") as Href,
    );
  };

  return (
    <View style={styles.root} testID="request.rateLimited">
      <View style={[styles.body, { paddingTop: insets.top + tokens.space.md }]}>
        <BackButton testID="request.rateLimited.back" onPress={() => router.back()} />
        <Text style={styles.display}>You’ve sent several requests this hour.</Text>
        <Text style={styles.copy}>
          {`You can send another in ${shown} ${shown === 1 ? "minute" : "minutes"}. Your specialist already has the others.`}
        </Text>
      </View>
      <View style={styles.footer}>
        {call ? (
          <Button
            testID="request.rateLimited.call"
            label="Call your specialist"
            shape="pill"
            onPress={() => void Linking.openURL(call)}
          />
        ) : null}
        <Button
          testID="request.rateLimited.done"
          label="Done"
          variant="ghost"
          shape="pill"
          onPress={() => router.back()}
        />
      </View>
      <View style={{ paddingBottom: insets.bottom }}>
        <TabBar testID="tabs.bar" active="requests" unread={0} onPress={openTab} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  body: { flex: 1, paddingHorizontal: tokens.space.lg, gap: tokens.space.md },
  display: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  copy: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  footer: { paddingHorizontal: tokens.space.lg, gap: tokens.space.sm, paddingBottom: tokens.space.md },
});
