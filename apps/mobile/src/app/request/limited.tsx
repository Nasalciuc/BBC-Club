import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, StyleSheet, View } from "react-native";
import { StateMessage, tokens } from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import { ScreenStatusBar } from "@/components/screen-status-bar";
import { telHref } from "@/features/requests/confirmation-logic";
import { env } from "@/lib/env";

/**
 * Too many requests this hour (27): the message in the middle of the page, `Call your specialist` under it — only where
 * the club's number is configured; `Done` otherwise. The tab bar shows Requests: the others are there.
 */
export default function RequestLimitedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ minutes?: string }>();
  const minutes = Number(params.minutes);
  const shown = Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
  const call = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);
  return (
    <View style={styles.root} testID="request.rateLimited">
      <ScreenStatusBar on="light" />
      <View style={styles.body}>
        <StateMessage
          testID="request.rateLimited.message"
          align="center"
          title="You’ve sent several requests this hour."
          body={`You can send another in ${shown} ${shown === 1 ? "minute" : "minutes"}. Your specialist already has the others.`}
          primary={
            call
              ? {
                  label: "Call your specialist",
                  icon: "phone",
                  testID: "request.rateLimited.call",
                  onPress: () => {
                    Linking.openURL(call).catch(() => undefined);
                  },
                }
              : { label: "Done", testID: "request.rateLimited.done", onPress: () => router.back() }
          }
        />
      </View>
      <RootTabBar active="requests" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: tokens.space.gutter },
});
