import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, TabBar, tokens, rn } from "@bbc/ui";

import {
  NotificationsAskSheet,
  type NotificationsAskSheetHandle,
} from "@/features/notifications/NotificationsAskSheet";
import { confirmationKind, type RequestSource } from "@/features/requests/confirmation-logic";
import { fetchProfile } from "@/lib/api";
import { shouldAskForPush, type PermissionStatus } from "@/lib/push-ask-logic";
import { appStorage, PUSH_ASKED_AT_KEY } from "@/lib/storage-keys";

export default function RequestConfirmedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const askRef = useRef<NotificationsAskSheetHandle>(null);
  const params = useLocalSearchParams<{
    id?: string;
    source?: string;
    queued?: string;
    city?: string;
    route?: string;
  }>();
  const source: RequestSource = params.source === "search" ? "search" : "offer";
  const kind = confirmationKind(source, params.queued === "1");
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const profile = await fetchProfile();
      if (!cancelled && profile.ok) setPhone(profile.data.phone);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (cancelled) return;
        const raw = appStorage.getString(PUSH_ASKED_AT_KEY);
        const parsed = raw == null || raw === "" ? null : Number(raw);
        const askedAt = parsed != null && Number.isFinite(parsed) ? parsed : null;
        const status: PermissionStatus =
          current.status === "granted" || current.status === "denied" ? current.status : "undetermined";
        if (shouldAskForPush(status, askedAt)) askRef.current?.present();
      } catch {
        // Permission state is best-effort; the request itself already succeeded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const city = typeof params.city === "string" ? params.city : "";
  const route = typeof params.route === "string" ? params.route : "";
  const id = typeof params.id === "string" ? params.id : "";

  return (
    <View style={styles.root} testID="confirmation.root">
      <View style={[styles.body, { paddingTop: insets.top + tokens.space.xl }]}>
        {kind === "search" ? (
          <View style={styles.globe}>
            <Icon name="explore" size={24} color={tokens.colors.textPrimary} />
          </View>
        ) : null}
        <Text style={styles.display}>
          {kind === "saved" ? "Saved. It goes out when you’re back online." : "Request received."}
        </Text>
        {kind === "saved" ? (
          <Text style={styles.copy}>
            You’re offline right now. Nothing more to do — a specialist will call you shortly after it arrives.
          </Text>
        ) : (
          <Text style={styles.copy}>
            {phone ? `A specialist will call you shortly on ${phone}.` : "A specialist will call you shortly."}
          </Text>
        )}
        {kind === "offer" && city ? <Text style={styles.city}>{`${city} is next.`}</Text> : null}
        {kind !== "saved" && route ? <Text style={styles.mono}>{route}</Text> : null}
        {kind === "saved" ? (
          <Button testID="confirmation.done" label="Done" shape="card" onPress={() => router.back()} />
        ) : (
          <Button
            testID="confirmation.viewRequest"
            label="View request"
            shape="card"
            onPress={() => {
              if (id) router.push(`/request/${id}` as Href);
            }}
          />
        )}
      </View>
      <View style={{ paddingBottom: insets.bottom }}>
        <TabBar
          testID="tabs.bar"
          active="explore"
          unread={0}
          onPress={(key) =>
            router.push(
              (key === "requests"
                ? "/(tabs)/requests"
                : key === "profile"
                  ? "/(tabs)/profile"
                  : "/(tabs)/explore") as Href,
            )
          }
        />
      </View>
      <NotificationsAskSheet ref={askRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.surfacePage },
  body: { flex: 1, paddingHorizontal: tokens.space.lg, gap: tokens.space.md },
  globe: { alignItems: "center", marginBottom: tokens.space.md },
  display: { ...rn(tokens.type.display), color: tokens.colors.textPrimary },
  copy: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  city: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  mono: { ...rn(tokens.type.factsMono), color: tokens.colors.textSecondary },
});
