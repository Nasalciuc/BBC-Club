import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, tokens, rn } from "@bbc/ui";

import { RootTabBar } from "@/components/RootTabBar";
import {
  NotificationsAskSheet,
  type NotificationsAskSheetHandle,
} from "@/features/notifications/NotificationsAskSheet";
import { confirmationKind, type RequestSource } from "@/features/requests/confirmation-logic";
import { fetchProfile } from "@/lib/api";
import { displayPhone } from "@/lib/phone";
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
    facts?: string;
    phone?: string;
  }>();
  const source: RequestSource = params.source === "search" ? "search" : "offer";
  const kind = confirmationKind(source, params.queued === "1");
  // The number this request will be called on, as the sheet sent it (Figma 135:856: `+1 (212) 555-0148`, as the
  // request's detail writes it); the profile's only when an older sheet passed none.
  const requestPhone = typeof params.phone === "string" && params.phone ? params.phone : null;
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const phone = requestPhone ?? profilePhone;

  useEffect(() => {
    // Saved on the phone (offline): this screen names no number, and there is no network to ask.
    if (requestPhone || kind === "saved") return;
    let cancelled = false;
    void (async () => {
      const profile = await fetchProfile();
      if (!cancelled && profile.ok) setProfilePhone(displayPhone(profile.data.phone));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [requestPhone, kind]);

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
  // Figma 135:856: `JFK → LHR · OCT 12–19 · ROUND TRIP · 1 ADULT` under the city; the route alone from an older sheet.
  const facts = typeof params.facts === "string" && params.facts ? params.facts : route;
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
        {kind !== "saved" && facts ? (
          <Text testID="confirmation.facts" style={styles.mono}>
            {facts}
          </Text>
        ) : null}
        {kind === "saved" ? (
          <Button testID="confirmation.done" label="Done" shape="pill" onPress={() => router.back()} />
        ) : (
          <Button
            testID="confirmation.viewRequest"
            label="View request"
            shape="pill"
            onPress={() => {
              if (id) router.push(`/request/${id}` as Href);
            }}
          />
        )}
      </View>
      <View style={{ paddingBottom: insets.bottom }}>
        <RootTabBar active="explore" />
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
