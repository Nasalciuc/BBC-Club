import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton, Button, tokens, rn } from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { telHref } from "@/features/requests/confirmation-logic";
import { env } from "@/lib/env";

export default function RequestLimitedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ minutes?: string }>();
  const minutes = Number(params.minutes);
  const shown = Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
  const call = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);
  return (
    <View style={styles.root} testID="request.rateLimited">
      <View style={[styles.body, { paddingTop: insets.top }]}>
        <BackButton testID="request.rateLimited.back" onPress={() => router.back()} />
        <View style={styles.message}>
          <Text style={styles.display}>You’ve sent several requests this hour.</Text>
          <Text style={styles.copy}>
            {`You can send another in ${shown} ${shown === 1 ? "minute" : "minutes"}. Your specialist already has the others.`}
          </Text>
        </View>
      </View>
      <View style={styles.footer}>
        {call ? (
          <Button
            testID="request.rateLimited.call"
            label="Call your specialist"
            variant="primary"
            onPress={() => {
              Linking.openURL(call).catch(() => undefined);
            }}
          />
        ) : null}
        <Button testID="request.rateLimited.done" label="Done" variant="secondary" onPress={() => router.back()} />
      </View>
      <RootTabBar active="requests" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  body: { flex: 1, paddingHorizontal: tokens.space.lg },
  // Figma 481:9061: the message 92 pt under the back button (184 on the frame), title and words 24 apart.
  message: { paddingTop: 92, gap: tokens.space.lg },
  display: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  copy: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  // The call over Done, 16 pt apart; Done 16 pt over the tab bar.
  footer: { paddingHorizontal: tokens.space.lg, gap: tokens.space.md, paddingBottom: tokens.space.md },
});
