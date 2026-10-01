import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, tokens, rn } from "@bbc/ui";

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
    <View style={[styles.root, { paddingTop: insets.top + tokens.space.xl }]} testID="request.rateLimited">
      <Text style={styles.display}>You’ve sent several requests this hour.</Text>
      <Text style={styles.copy}>
        {`You can send another in ${shown} ${shown === 1 ? "minute" : "minutes"}. Your specialist already has the others.`}
      </Text>
      {call ? (
        <Button
          testID="request.rateLimited.call"
          label="Call your specialist"
          shape="card"
          onPress={() => void Linking.openURL(call)}
        />
      ) : null}
      <Button
        testID="request.rateLimited.done"
        label="Done"
        variant="ghost"
        shape="card"
        onPress={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.surfacePage,
    paddingHorizontal: tokens.space.lg,
    gap: tokens.space.md,
  },
  display: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  copy: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
});
