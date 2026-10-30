import * as Notifications from "expo-notifications";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ListRow, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

import { putNotificationPreferences } from "@/lib/api";
import type { ProfileSheetHandle } from "./types";

type Props = {
  /** What the member saved (profile.notifications.offers), or null while unknown — never a default. */
  savedOffers: boolean | null;
  /** The server accepted a new value. */
  onSaved: (offers: boolean) => void;
};

const IOS = Platform.OS === "ios";

/**
 * Figma 238:5384 / 325:8648: what reaches the member. `Request updates` is always on, its switch locked; `Offers to
 * inspire` is theirs to change. When the phone has turned the app's notifications off, both read off and dimmed, and
 * the sheet offers the phone's settings — the system never asks a second time.
 */
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
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<Text>(null);
  useEffect(() => {
    if (error) modalRef.current?.reveal(errorRef.current);
  }, [error]);

  // Back from the phone's settings with the sheet still open: read the permission again.
  useEffect(() => {
    if (!open) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPermission();
    });
    return () => subscription.remove();
  }, [open]);

  useImperativeHandle(ref, () => ({
    present() {
      setDenied(false);
      setBusy(false);
      setError(null);
      setOpen(true);
      modalRef.current?.present();
      void refreshPermission();
    },
    dismiss() {
      modalRef.current?.dismiss();
    },
  }));

  async function refreshPermission() {
    const current = await Notifications.getPermissionsAsync().catch(() => null);
    setDenied(current?.status === "denied");
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
      onDismiss={() => setOpen(false)}
      footer={
        <Button
          testID="notifications.done"
          label="Done"
          variant="primary"
          onPress={() => modalRef.current?.dismiss()}
        />
      }
    >
      {denied ? (
        <Text testID="notifications.denied" style={styles.intro}>
          {IOS
            ? "Notifications are off for BuyBusinessClass in iOS Settings."
            : "Notifications are off for BuyBusinessClass in device settings."}
        </Text>
      ) : (
        <Text testID="notifications.intro" style={styles.intro}>
          Choose what reaches you. Your request details remain available in the app.
        </Text>
      )}

      {denied ? (
        <Button
          testID="notifications.openSettings"
          label="Open Settings"
          variant="secondary"
          style={styles.openSettings}
          onPress={() => {
            void Linking.openSettings();
          }}
        />
      ) : null}

      {/* Figma 238:5501: each switch in its card, its note 12 pt under it. */}
      <View style={styles.group}>
        <ListRow
          testID="notifications.requestUpdates.row"
          label="Request updates"
          disabled={denied}
          toggle={{ value: !denied, locked: !denied, testID: "notifications.requestUpdates" }}
        />
        <Text style={styles.note}>When your quote is ready or your request changes. Always on.</Text>
      </View>

      <View style={styles.group}>
        <ListRow
          testID="notifications.offers.row"
          label="Offers to inspire"
          disabled={denied}
          toggle={{
            value: !denied && offersOn === true,
            // Unknown, or a save in flight: the switch shows and waits.
            onChange: offersOn === null || busy ? undefined : (next) => void onOffers(next),
            testID: "notifications.offers",
          }}
        />
        <Text style={styles.note}>Occasional flight ideas selected for you.</Text>
        {error ? (
          <Text ref={errorRef} testID="notifications.error" style={styles.note}>
            {error}
          </Text>
        ) : null}
      </View>

      <Text style={styles.footnote}>
        {denied
          ? IOS
            ? "An agent will still call about a request you send. Request updates stay on when iOS notifications are allowed."
            : "An agent will still call about a request you send. Request updates stay on when notifications are allowed."
          : "An agent will still call about a request you send. These switches control app notifications."}
      </Text>
    </ModalSheet>
  );
});

const styles = StyleSheet.create({
  intro: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
  // 325:8773: the 48-pt secondary button.
  openSettings: { minHeight: 48, paddingVertical: tokens.space.sm },
  group: { gap: tokens.space.sm },
  // A message is `text-secondary`, never `status-danger` (DESIGN.md: that is for a field at fault only).
  note: { ...rn(tokens.type.bodySm), color: tokens.colors.textSecondary },
  footnote: { ...rn(tokens.type.caption), color: tokens.colors.textSecondary },
});
