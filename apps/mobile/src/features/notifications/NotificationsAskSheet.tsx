import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ModalSheet, type ModalSheetHandle, tokens, rn } from "@bbc/ui";

import { registerPushDevice } from "@/lib/push";
import { appStorage, PUSH_ASKED_AT_KEY } from "@/lib/storage-keys";

export type NotificationsAskSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

function markAsked() {
  appStorage.set(PUSH_ASKED_AT_KEY, String(Date.now()));
}

/**
 * Shown once, after the first request is received. Figma 320:5704: a question — the medium sheet under a 28-pt headline;
 * `Turn on notifications` (iOS then asks once, itself) and `Not now` 12 pt under it. Closing it any way is Not now.
 */
export const NotificationsAskSheet = forwardRef<NotificationsAskSheetHandle>(
  function NotificationsAskSheet(_props, ref) {
    const modalRef = useRef<ModalSheetHandle>(null);
    const insets = useSafeAreaInsets();

    useImperativeHandle(ref, () => ({
      present() {
        modalRef.current?.present();
      },
      dismiss() {
        modalRef.current?.dismiss();
      },
    }));

    return (
      <ModalSheet
        ref={modalRef}
        title="Know when your quote is ready."
        size="medium"
        closeTestID="push-ask.close"
        testID="push-ask.root"
        insets={insets}
        stackBehavior="push"
        onDismiss={markAsked}
        footer={
          <View style={styles.actions}>
            <Button
              testID="push-ask.turn-on"
              label="Turn on notifications"
              variant="primary"
              onPress={() => {
                void (async () => {
                  try {
                    await registerPushDevice({ prompt: true });
                    markAsked();
                    modalRef.current?.dismiss();
                  } catch {
                    // The system dialog never appeared. Leave the sheet unmarked so the next request can ask.
                  }
                })();
              }}
            />
            <Button
              testID="push-ask.not-now"
              label="Not now"
              variant="secondary"
              style={styles.notNow}
              onPress={() => modalRef.current?.dismiss()}
            />
          </View>
        }
      >
        <Text style={styles.body}>
          We’ll notify you once when your specialist has a quote. Nothing else unless you choose it.
        </Text>
      </ModalSheet>
    );
  },
);

const styles = StyleSheet.create({
  // 320:5802: the two actions 12 pt apart; `Not now` is the 48-pt secondary button.
  actions: { gap: tokens.space.sm },
  notNow: { minHeight: 48, paddingVertical: tokens.space.sm },
  body: { ...rn(tokens.type.body), color: tokens.colors.textSecondary },
});
