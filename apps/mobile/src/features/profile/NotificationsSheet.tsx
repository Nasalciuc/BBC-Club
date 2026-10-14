import * as Notifications from "expo-notifications";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

import { putNotificationPreferences } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

type Props = {
  /** What the member saved (profile.notifications.offers), or null while unknown — never a default. */
  savedOffers: boolean | null;
  /** The server accepted a new value. */
  onSaved: (offers: boolean) => void;
};

export const NotificationsSheet = forwardRef<ProfileSheetHandle, Props>(function NotificationsSheet(
  { savedOffers, onSaved },
  ref,
) {
  const modalRef = useRef<ModalSheetHandle>(null);
  const insets = useSafeAreaInsets();
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
    <ModalSheet
      ref={modalRef}
      title="Notifications"
      closeTestID="notifications.close"
      testID="notifications.root"
      dismissible={!busy}
      insets={insets}
    >
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
            variant="secondary"
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
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
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
