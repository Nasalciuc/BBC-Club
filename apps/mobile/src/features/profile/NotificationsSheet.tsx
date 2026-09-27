import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import * as Notifications from "expo-notifications";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";
import { Button, CloseButton, tokens, rn } from "@bbc/ui";

import { putNotificationPreferences } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

export const NotificationsSheet = forwardRef<ProfileSheetHandle>(function NotificationsSheet(_props, ref) {
  const modalRef = useRef<BottomSheetModal>(null);
  const [offersOn, setOffersOn] = useState(true);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    present() {
      setOffersOn(true);
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
    if (!result.ok) setError(result.message);
  }

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={["50%"]}
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
              Notifications are off for BuyBusinessClass in iOS Settings.
            </Text>
            <Button
              testID="notifications.openSettings"
              label="Open Settings"
              shape="card"
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
            value={offersOn}
            disabled={denied || busy}
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
