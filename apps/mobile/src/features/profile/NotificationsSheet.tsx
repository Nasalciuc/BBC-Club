import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import * as Notifications from "expo-notifications";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, Switch, Text, View } from "react-native";
import { Button, CloseButton, tokens, rn } from "@bbc/ui";

import { putNotificationPreferences } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

type Props = {
  /** What the member saved (profile.notifications.offers), or null while unknown — never a default. */
  savedOffers: boolean | null;
  /** The server accepted a new value. */
  onSaved: (offers: boolean) => void;
};

const NOTIFICATIONS_SNAP_POINTS = ["50%"] as const;

export const NotificationsSheet = forwardRef<ProfileSheetHandle, Props>(function NotificationsSheet(
  { savedOffers, onSaved },
  ref,
) {
  const modalRef = useRef<BottomSheetModal>(null);
  const [offersOn, setOffersOn] = useState<boolean | null>(null);
  useEffect(() => {
    setOffersOn(savedOffers);
  }, [savedOffers]);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    present() {
      setDenied(false);
      setBusy(false);
      setError(null);
      modalRef.current?.present();
      void refreshPermission();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function refreshPermission() {
    const current = await Notifications.getPermissionsAsync();
    setDenied(current.status === "denied");
  }

  async function onOffers(enabled: boolean) {
    const previous = offersOn;
    if (previous === null) return;
    setOffersOn(enabled);
    setBusy(true);
    setError(null);
    const result = await putNotificationPreferences({
      preferences: [
        { category: "offers_personal", enabled },
        { category: "offers_broadcast", enabled },
      ],
    });
    setBusy(false);
    if (!result.ok) {
      setOffersOn(previous);
      setError(result.message);
      return;
    }
    onSaved(enabled);
  }

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={[...NOTIFICATIONS_SNAP_POINTS]}
      enablePanDownToClose={!busy}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content} testID="notifications.root">
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          <CloseButton testID="notifications.close" onPress={() => modalRef.current?.dismiss()} />
        </View>

        {denied ? (
          <View style={styles.denied}>
            <Text testID="notifications.denied" style={styles.caption}>
              {Platform.OS === "ios"
                ? "Notifications are off for BuyBusinessClass in iOS Settings."
                : "Notifications are off for BuyBusinessClass in device settings."}
            </Text>
            <Button
              testID="notifications.openSettings"
              label="Open Settings"
              variant="ghost"
              shape="pill"
              onPress={() => {
                void Linking.openSettings();
              }}
            />
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.label}>Request updates</Text>
            <Text style={styles.caption}>When your quote is ready or your request changes. Always on.</Text>
          </View>
          <Switch
            testID="notifications.requestUpdates"
            value
            disabled
            trackColor={{ true: tokens.colors.primary, false: tokens.colors.borderDefault }}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.label}>Offers to inspire</Text>
          </View>
          <Switch
            testID="notifications.offers"
            value={offersOn ?? false}
            disabled={offersOn === null || denied || busy}
            onValueChange={(v) => {
              void onOffers(v);
            }}
            trackColor={{ true: tokens.colors.primary, false: tokens.colors.borderDefault }}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  bg: {
    backgroundColor: tokens.colors.surfacePage,
    borderTopLeftRadius: tokens.radius.panel,
    borderTopRightRadius: tokens.radius.panel,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.colors.borderDefault },
  content: { paddingHorizontal: tokens.space.lg, paddingBottom: tokens.space.xxl, gap: tokens.space.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...rn(tokens.type.title), color: tokens.colors.textPrimary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.md,
    minHeight: 56,
  },
  copy: { flex: 1, gap: tokens.space.xxs },
  label: { ...rn(tokens.type.body), color: tokens.colors.textPrimary },
  caption: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
  denied: { gap: tokens.space.sm },
  error: { ...rn(tokens.type.caption), color: tokens.colors.statusDanger },
});
